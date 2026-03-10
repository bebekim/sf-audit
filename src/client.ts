/**
 * Salesforce REST API client.
 *
 * Read-only by design. Uses Node built-in https — zero npm dependencies.
 * Blocks write operations at the query level.
 */
import https from 'node:https';
import {
  SFQueryResult,
  SFDescribeResult,
  SFGlobalDescribe,
  SFLimits,
} from './types.js';

const API_VERSION = 'v59.0';
const WRITE_PATTERN =
  /\b(INSERT|UPDATE|DELETE|UPSERT|MERGE|UNDELETE)\b/i;

export class SalesforceClient {
  private accessToken: string;
  private instanceUrl: string;
  private requestCount = 0;

  constructor(accessToken: string, instanceUrl: string) {
    this.accessToken = accessToken;
    // Strip trailing slash
    this.instanceUrl = instanceUrl.replace(/\/+$/, '');
  }

  getRequestCount(): number {
    return this.requestCount;
  }

  async query(soql: string): Promise<SFQueryResult> {
    if (WRITE_PATTERN.test(soql)) {
      throw new Error(
        `Write operation blocked. This client is read-only. Query: ${soql.slice(0, 100)}`,
      );
    }
    const encoded = encodeURIComponent(soql);
    const path = `/services/data/${API_VERSION}/query/?q=${encoded}`;
    return this.request<SFQueryResult>(path);
  }

  async toolingQuery(soql: string): Promise<SFQueryResult> {
    if (WRITE_PATTERN.test(soql)) {
      throw new Error(
        `Write operation blocked. This client is read-only. Query: ${soql.slice(0, 100)}`,
      );
    }
    const encoded = encodeURIComponent(soql);
    const path = `/services/data/${API_VERSION}/tooling/query/?q=${encoded}`;
    return this.request<SFQueryResult>(path);
  }

  async describeGlobal(): Promise<SFGlobalDescribe> {
    const path = `/services/data/${API_VERSION}/sobjects/`;
    return this.request<SFGlobalDescribe>(path);
  }

  async describeObject(objectName: string): Promise<SFDescribeResult> {
    const path = `/services/data/${API_VERSION}/sobjects/${objectName}/describe/`;
    return this.request<SFDescribeResult>(path);
  }

  async getLimits(): Promise<SFLimits> {
    const path = `/services/data/${API_VERSION}/limits/`;
    return this.request<SFLimits>(path);
  }

  private request<T>(path: string): Promise<T> {
    this.requestCount++;
    const url = new URL(path, this.instanceUrl);

    return new Promise<T>((resolve, reject) => {
      const req = https.request(
        url,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            Accept: 'application/json',
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(body));
              } catch (err) {
                reject(
                  new Error(`JSON parse error: ${(err as Error).message}`),
                );
              }
            } else {
              reject(
                new Error(
                  `Salesforce API ${res.statusCode}: ${body.slice(0, 500)}`,
                ),
              );
            }
          });
        },
      );

      req.on('error', reject);
      req.end();
    });
  }
}
