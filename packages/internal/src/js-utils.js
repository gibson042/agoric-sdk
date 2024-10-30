// @ts-check
// @jessie-check
// The functions in this file must be compatible with but not dependent upon
// a hardened environment.
// TODO: Bring in more functions from utils.js.

/**
 * @param {any} value
 * @param {string | undefined} name
 * @param {object | undefined} container
 * @param {(value: any, name: string, record: object) => any} mapper
 * @returns {any}
 */
const deepMapObjectInternal = (value, name, container, mapper) => {
  if (container && typeof name === 'string') {
    const mapped = mapper(value, name, container);
    if (mapped !== value) {
      return mapped;
    }
  }

  if (typeof value !== 'object' || !value) {
    return value;
  }

  let wasMapped = false;
  const mappedEntries = Object.entries(value).map(([innerName, innerValue]) => {
    const mappedInnerValue = deepMapObjectInternal(
      innerValue,
      innerName,
      value,
      mapper,
    );
    wasMapped ||= mappedInnerValue !== innerValue;
    return [innerName, mappedInnerValue];
  });

  return wasMapped ? Object.fromEntries(mappedEntries) : value;
};

/**
 * Recursively traverses a record object structure, calling a mapper function
 * for each enumerable string-keyed property and returning a record composed of
 * the results. If none of the values are changed, the original object is
 * returned, maintaining its identity.
 *
 * When the property value is an object, it is sent to the mapper like any other
 * value, and then recursively traversed unless replaced with a distinct value.
 *
 * @param {object} obj
 * @param {(value: any, name: string, record: object) => any} mapper
 * @returns {object}
 */
export const deepMapObject = (obj, mapper) =>
  deepMapObjectInternal(obj, undefined, undefined, mapper);
