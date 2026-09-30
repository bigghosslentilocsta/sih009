/** Module A - exploration API client. */

import api from './apiClient.js';

/**
 * Analyse a GeoJSON polygon for manganese suitability.
 * @param {{name: string, geometry: object, gridResolution?: number}} params
 */
export const analyzeZone = (params) => api.post('/exploration/analyze', params);

export default { analyzeZone };
