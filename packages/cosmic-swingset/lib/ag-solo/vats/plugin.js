/* global harden */
// @ts-check

import makeStore from '@agoric/store';
import { makeCapTP } from '@agoric/captp';

/**
 * @template T
 * @typedef {T} Device
 */

/**
 * @typedef {Object} PluginManager
 * @property {(mod: string) => ERef<any>} load
 */

/**
 * @typedef {Object} Receiver
 * @property {(index: number, obj: Record<string, any>) => void} receive
 */

/**
 * @typedef {Object} PluginDevice
 * @property {(mod: string) => number} connect
 * @property {(receiver: Receiver) => void} registerReceiver
 * @property {(index: number, obj: Record<string, any>) => void} send
 */

/**
 * Create a handler that manages a promise interface to external modules.
 *
 * @param {import('@agoric/eventual-send').EProxy} E The eventual sender
 * @param {<T>(target: Device<T>) => T} D The device sender
 * @param {Device<PluginDevice>} pluginDevice The bridge to manage
 * @returns {PluginManager} admin facet for this handler
 */
export function makePluginManager(E, D, pluginDevice) {
  /**
   * @type {import('@agoric/store').Store<number, (obj: Record<string,any>) => void>}
   */
  const modReceivers = makeStore('moduleIndex');

  // Dispatch object to the right index.
  D(pluginDevice).registerReceiver(
    harden({
      receive(index, obj) {
        console.info('receive', index, obj);
        modReceivers.get(index)(obj);
      },
    }),
  );

  return harden({
    load(mod) {
      // Start CapTP on the plugin module's side.
      const index = D(pluginDevice).connect(mod);
      if (typeof index === 'string') {
        throw Error(index);
      }
      // Create a CapTP channel.
      const { getBootstrap, dispatch } = makeCapTP(mod, obj =>
        D(pluginDevice).send(index, obj),
      );
      // Register our dispatcher for this connect index.
      modReceivers.init(index, dispatch);

      // Give up our bootstrap object for the caller to use.
      return getBootstrap();
    },
  });
}
