const filtersByResource = {
  containers: ['until', 'label', 'label!'], images: ['until', 'label', 'label!'],
  volumes: ['label', 'label!'], networks: ['until', 'label', 'label!'],
  'build-cache': ['until', 'id', 'parent', 'type', 'description', 'inuse', 'shared', 'private'],
};
const invalid = message => Object.assign(new Error(message), { statusCode: 400 });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function pruneOptions(resource, input = {}) {
  if (!Object.hasOwn(filtersByResource, resource)) throw Object.assign(new Error('Resource cannot be pruned'), { statusCode: 404 });
  if (!object(input)) throw invalid('Prune options must be an object');
  if (Object.hasOwn(input, 'data')) {
    if (Object.keys(input).length !== 1 || !object(input.data)) throw invalid('Use either data or direct prune options');
    input = input.data;
  }
  for (const key of Object.keys(input)) if (!['all', 'filters', 'keep_storage'].includes(key)) throw invalid(`Unknown prune option: ${key}`);
  if (Object.hasOwn(input, 'all') && (typeof input.all !== 'boolean' || !['images', 'volumes', 'build-cache'].includes(resource))) throw invalid('all must be a boolean and is only supported for images, volumes, and build-cache');
  if (Object.hasOwn(input, 'keep_storage') && (resource !== 'build-cache' || !Number.isSafeInteger(input.keep_storage) || input.keep_storage < 0)) throw invalid('keep_storage must be a non-negative integer for build-cache');
  const filters = {};
  if (Object.hasOwn(input, 'filters')) {
    if (!object(input.filters)) throw invalid('filters must be an object of non-empty string arrays');
    for (const [key, values] of Object.entries(input.filters)) {
      if (!filtersByResource[resource].includes(key)) throw invalid(`Unsupported ${resource} filter: ${key}`);
      if (!Array.isArray(values) || !values.length || values.some(v => typeof v !== 'string' || !v.trim())) throw invalid('Each filter must contain a non-empty array of non-empty strings');
      filters[key] = values;
    }
  }
  // These scope controls cannot be overridden by a raw Docker filter.
  if (resource === 'images') filters.dangling = [input.all ? 'false' : 'true'];
  if (resource === 'volumes') filters.all = [input.all ? 'true' : 'false'];
  return { filters, ...(resource === 'build-cache' ? { all: input.all || false, ...(input.keep_storage !== undefined ? { 'keep-storage': input.keep_storage } : {}) } : {}) };
}

export function pruneDocker(docker, resource, options) {
  // Dial directly: Dockerode's pruneBuilder currently drops all query options.
  return new Promise((resolve, reject) => docker.modem.dial({
    path: `/${resource === 'build-cache' ? 'build' : resource}/prune?`, method: 'POST', options,
    statusCodes: { 200: true, 400: 'bad parameter', 409: 'prune already running', 500: 'server error', 503: 'unavailable' },
  }, (error, data) => error ? reject(error) : resolve(data)));
}
