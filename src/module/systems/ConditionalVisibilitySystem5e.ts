import { ConditionalVisibilityFacade } from '../ConditionalVisibilityFacade';
import { DefaultConditionalVisibilitySystem } from './DefaultConditionalVisibilitySystem';
import { getCanvas, getGame, MODULE_NAME, StatusEffect } from '../settings';
import { i18n } from '../../conditional-visibility';
import { ConditionalVisibility } from '../ConditionalVisibility';

/**
 * Conditional visibility system for dnd5e.  Uses the same base conditions, plus adds hidden, which compares
 * stealth with passive perception.
 */
export class ConditionalVisibilitySystem5e extends DefaultConditionalVisibilitySystem {
  async onCreateEffect(effect, options, userId) {
    const status = this.getEffectByIcon(effect);
    if (status) {
      //const actor = effect.parent;
      //await actor.setFlag(MODULE_NAME, status.visibilityId, true);
      const flag = 'flags.conditional-visibility.' + status.visibilityId;
      if (effect.parent.isToken) {
        ConditionalVisibility.INSTANCE.sceneUpdates.push({ _id: effect.parent.parent.id, ['actorData.' + flag]: true });
        ConditionalVisibility.INSTANCE.sceneUpdates.push({
          _id: effect.parent.parent.id,
          ['actorData.flags.conditional-visibility.hasEffect']: true,
        });
      } else {
        ConditionalVisibility.INSTANCE.actorUpdates.push({ _id: effect.parent.id, [flag]: true });
      }
      ConditionalVisibility.INSTANCE.debouncedUpdate();
    }
  }

  async onDeleteEffect(effect, options, userId) {
    const status = this.getEffectByIcon(effect);
    if (status) {
      //const actor = effect.parent;
      //await actor.unsetFlag(MODULE_NAME, status.visibilityId, true);
      const flag = 'flags.conditional-visibility.' + status.visibilityId;
      if (effect.parent.isToken) {
        ConditionalVisibility.INSTANCE.sceneUpdates.push({
          _id: effect.parent.parent.id,
          ['actorData.' + flag]: false,
        });
        //Check if its the last effect that causes hidden status
        if (
          Array.from(this.effectsByCondition().values()).filter(
            (e) => effect.parent.getFlag(MODULE_NAME, e.visibilityId) ?? false,
          ).length == 1
        ) {
          ConditionalVisibility.INSTANCE.sceneUpdates.push({
            _id: effect.parent.parent.id,
            ['actorData.flags.conditional-visibility.hasEffect']: false,
          });
        }
      } else {
        ConditionalVisibility.INSTANCE.actorUpdates.push({ _id: effect.parent.id, [flag]: false });
      }
      ConditionalVisibility.INSTANCE.debouncedUpdate();
    }
  }

  /**
   * Use the base conditions, plus set up the icon for the "hidden" condition
   */
  effects() {
    const effects = super.effects();
    effects.push({
      id: MODULE_NAME + '.hidden',
      visibilityId: 'hidden',
      label: i18n(MODULE_NAME + '.hidden'),
      icon: 'modules/' + MODULE_NAME + '/icons/newspaper.svg',
    });
    return effects;
  }

  gameSystemId() {
    return 'dnd5e';
  }

  initializeHooks(facade) {
    Hooks.on('createChatMessage', (message, jQuery, speaker) => {
      if (
        getGame().settings.get(MODULE_NAME, 'autoStealth') === true &&
        message.data.flags.dnd5e &&
        message.data.flags.dnd5e.roll &&
        message.data.flags.dnd5e.roll.skillId === 'ste'
      ) {
        if (message.data.speaker.token) {
          const tokenId = message.data.speaker.token;
          const token = getCanvas().tokens?.placeables.find((tok) => tok.id === tokenId);
          if (token && token.owner) {
            facade.hide([token], message._roll.total);
          }
        }
      }
    });
  }

  /**
   * Get the base vision capabilities, and add the maximum passive perception for any token in the list.
   * @param srcTokens tokens whos abilities to test
   */
  getVisionCapabilities(srcToken: Array<Token> | Token): any {
    if (srcToken ?? false) {
      const flags = super.getVisionCapabilities(srcToken);
      //@ts-ignore
      flags.prc = srcToken?.actor?.data?.data?.skills?.prc?.passive ?? -1;
      return flags;
    }
    return false;
  }
  /**
   * Override seeContested to compare any available stealth with the passive perception calculated in getVisionCapabilities
   * @param target the toekn to try and see
   * @param flags the flags calculated from getVisionCapabilities
   */
  seeContested(target: Token, visionCapabilities: any): boolean {
    const hidden = this.hasStatus(target, 'hidden');
    if (hidden === true) {
      const actor = target.actor;

      if (actor?.getFlag[MODULE_NAME] && actor?.getFlag[MODULE_NAME]._ste) {
        const stealth = actor?.getFlag(MODULE_NAME,'_ste');
        if (visionCapabilities.prc < stealth) {
          return false;
        }
      } else {
        return false;
      }
    }
    return true;
  }

  initializeOnToggleEffect(tokenHud) {
    const realOnToggleEffect = tokenHud._onToggleEffect.bind(tokenHud);

    tokenHud._onToggleEffect = (event, opts) => {
      const icon = event.currentTarget;
      if (icon.src.endsWith('newspaper.svg')) {
        const object = tokenHud.object;
        if (icon.className.indexOf('active') < 0) {
          this.stealthHud(object).then((result) => {
            if (!object.data.flags) {
              object.data.flags = {};
            }
            if (!object.data.flags[MODULE_NAME]) {
              object.data.flags[MODULE_NAME] = {};
            }
            //object.setFlag(MODULE_NAME, "_ste", result);
            if (object.actor) {
              if (!object.actor.data) {
                object.actor.data = {};
              }
              if (!object.actor.data.flags) {
                object.actor.data.flags = {};
              }
              if (!object.actor.data.flags[MODULE_NAME]) {
                object.actor.data.flags[MODULE_NAME] = {};
              }
              object.actor.setFlag(MODULE_NAME, '_ste', result);
            }
            return realOnToggleEffect(event, opts);
          });
        } else {
          if (object.getFlag(MODULE_NAME, '_ste')) {
            object.unsetFlag(MODULE_NAME, '_ste');
          }
          if (object.actor && object.actor.getFlag(MODULE_NAME, '_ste')) {
            object.actor.unsetFlag(MODULE_NAME, '_ste');
          }
          return realOnToggleEffect(event, opts);
        }
        return false;
      } else {
        return realOnToggleEffect(event, opts);
      }
    };
  }

  hasStealth() {
    return true;
  }

  rollStealth(token: Token): Roll {
    if (token && token.actor) {
      return new Roll('1d20 + (' + token.actor.data.data.skills.ste.total + ')');
    } else {
      return super.rollStealth(token);
    }
  }
}
