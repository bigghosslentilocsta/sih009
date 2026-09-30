/** Module C - executive summary + report export. */

import api from './apiClient.js';

export const getSummary = (params = {}) => api.get('/executive/summary', { params });

/**
 * Download the executive report as a CSV.
 *
 * A plain <a href> cannot carry the Bearer token, so the file is fetched with
 * the authenticated client and handed to the browser as a blob. The filename
 * comes from the server's Content-Disposition header.
 *
 * @returns {Promise<string>} the filename that was saved
 */
export async function downloadExecutiveReport() {
  const response = await api.get('/executive/export', { responseType: 'blob' });

  const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const disposition = response.headers?.['content-disposition'] ?? '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = match?.[1] ?? 'SIH26009_Executive_Report.csv';

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return filename;
}
