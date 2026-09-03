import crypto from 'crypto';

/**
 * Deterministically computes an incident fingerprint hash.
 * Formula: SHA256(clusterId:namespace:resourceKind:resourceName:incidentType:container:rootCauseCategory)
 */
export function generateIncidentFingerprint(
  clusterId: string,
  namespace: string,
  resourceKind: string,
  resourceName: string,
  incidentType: string,
  containerName = '',
  rootCauseCategory = ''
): string {
  const normalizedKey = [
    String(clusterId || '').trim(),
    String(namespace || '').trim().toLowerCase(),
    String(resourceKind || '').trim().toLowerCase(),
    String(resourceName || '').trim().toLowerCase(),
    String(incidentType || '').trim(),
    String(containerName || '').trim().toLowerCase(),
    String(rootCauseCategory || '').trim()
  ].join(':');

  return crypto.createHash('sha256').update(normalizedKey).digest('hex');
}
