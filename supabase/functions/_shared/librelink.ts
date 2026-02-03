import { createHash } from "node:crypto";

export interface GlucoseData {
  value: number;
  trend: number;
  trendMessage?: string;
  time: number;
  isHigh: boolean;
  isLow: boolean;
  unit: string;
  isRealtime?: boolean; // true = live sensor reading, false = historical/backfill data
}

export interface Patient {
  patientId: string;
  firstName: string;
  lastName: string;
}

/**
 * Parse FactoryTimestamp (UTC) from LibreLinkUp API.
 * Format: "M/d/y h:m:s a" in UTC (e.g., "11/10/2023 3:45:16 PM")
 * This is the sensor's actual measurement time and should be used as the source of truth.
 */
function parseFactoryTimestamp(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || value.trim() === "") return 0;

  const raw = value.trim();

  // LibreLinkUp format: "M/d/y h:m:s a" (e.g., "11/10/2023 3:45:16 PM")
  // This is in UTC, we need to parse it as such
  const match = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})\s+(AM|PM)$/i,
  );
  if (match) {
    const [, month, day, year, hourStr, minute, second, ampm] = match;
    let hour = parseInt(hourStr, 10);
    if (ampm.toUpperCase() === "PM" && hour !== 12) hour += 12;
    if (ampm.toUpperCase() === "AM" && hour === 12) hour = 0;

    // Create date in UTC
    const utcMs = Date.UTC(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      hour,
      parseInt(minute, 10),
      parseInt(second, 10),
    );
    return Number.isFinite(utcMs) ? utcMs : 0;
  }

  // Fallback: try ISO parsing with UTC assumption
  const hasTimeZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(raw);
  const isoish = hasTimeZone ? raw : `${raw}Z`;
  const ms = new Date(isoish).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Parse local Timestamp as fallback (only used if FactoryTimestamp is missing).
 */
function parseLocalTimestamp(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || value.trim() === "") return 0;

  const raw = value.trim();

  // LibreLinkUp format: "M/d/y h:m:s a" in local time
  const match = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})\s+(AM|PM)$/i,
  );
  if (match) {
    const [, month, day, year, hourStr, minute, second, ampm] = match;
    let hour = parseInt(hourStr, 10);
    if (ampm.toUpperCase() === "PM" && hour !== 12) hour += 12;
    if (ampm.toUpperCase() === "AM" && hour === 12) hour = 0;

    // Create date in local time
    const date = new Date(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      hour,
      parseInt(minute, 10),
      parseInt(second, 10),
    );
    return Number.isFinite(date.getTime()) ? date.getTime() : 0;
  }

  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export class LibreLinkUpClient {
  private token: string = "";
  private userId: string = "";
  private region: string = "";
  private topLevelDomain: string = "io";
  private apiVersion: string = "4.17.0";
  private product: string = "llu.android";
  private autoAcceptTerms: boolean = true;

  constructor(
    private email?: string,
    private password?: string,
    region?: string,
    token?: string,
    userId?: string,
  ) {
    if (region) this.region = region;
    if (token) this.token = token;
    if (userId) this.userId = userId;
  }

  public getSession() {
    return {
      token: this.token,
      userId: this.userId,
      region: this.region,
    };
  }

  private encryptSHA256(value: string): string {
    return createHash("sha256").update(value.trim()).digest("hex");
  }

  private getUrl(endpoint: string): string {
    const baseUrl = this.region
      ? `https://api-${this.region}.libreview.${this.topLevelDomain}`
      : `https://api.libreview.${this.topLevelDomain}`;
    return baseUrl + endpoint;
  }

  private getHeaders() {
    const headers: Record<string, string> = {
      product: this.product,
      version: this.apiVersion,
      Accept: "application/json",
      "Content-Type": "application/json",
      "cache-control": "no-cache",
    };

    if (this.userId) {
      headers["Account-Id"] = this.encryptSHA256(this.userId);
    }

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    return headers;
  }

  private async request(
    endpoint: string,
    method: string = "GET",
    body?: any,
    lastError4Type: string = "",
  ): Promise<any> {
    const url = this.getUrl(endpoint);
    const response = await fetch(url, {
      method,
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (data.status === 0 && data.data?.redirect && data.data?.region) {
      this.region = data.data.region;
      return this.request(endpoint, method, body, lastError4Type);
    }

    if (data.status === 4) {
      const step = data.data?.step;
      const type = step?.type;
      const ticket = data.data?.authTicket;

      if (ticket?.token) {
        this.token = ticket.token;
      }

      if (type && type !== lastError4Type && this.autoAcceptTerms) {
        await this.request(`/auth/continue/${type}`, "POST", null, type);
        return this.request(endpoint, method, body, type);
      }

      throw new Error(
        data.error?.message || `Required action: ${type || "Accept Terms"}`,
      );
    }

    if (data.status !== 0) {
      throw new Error(
        data.error?.message || `API error with status ${data.status}`,
      );
    }

    return data;
  }

  async login(): Promise<void> {
    if (!this.email || !this.password) {
      throw new Error("Email and password are required for login");
    }

    const data = await this.request("/llu/auth/login", "POST", {
      email: this.email,
      password: this.password,
    });

    this.token = data.data.authTicket.token;
    this.userId = data.data.user.id;
    if (data.data.region) {
      this.region = data.data.region;
    }
  }

  async getConnections(): Promise<Patient[]> {
    if (!this.token) await this.login();
    const data = await this.request("/llu/connections");
    return data.data.map((conn: any) => ({
      patientId: conn.patientId,
      firstName: conn.firstName,
      lastName: conn.lastName,
    }));
  }

  async getGlucose(
    patientId: string,
  ): Promise<{ measurement: GlucoseData | null; graph: GlucoseData[] }> {
    if (!this.token) await this.login();
    const data = await this.request(`/llu/connections/${patientId}/graph`);

    const mapMeasurement = (m: any): GlucoseData | null => {
      if (!m) return null;
      // Use FactoryTimestamp (UTC sensor time) as source of truth, like GlucoDataHandler does
      // This prevents duplicate entries when the API returns the same measurement multiple times
      const factoryTime = parseFactoryTimestamp(m.FactoryTimestamp);
      const localTime = parseLocalTimestamp(m.Timestamp);
      const time = factoryTime > 0 ? factoryTime : localTime;

      // If we can't get a valid time, skip this measurement
      if (time <= 0) return null;

      return {
        value: m.ValueInMgPerDl,
        trend: m.TrendArrow,
        time,
        isHigh: m.isHigh,
        isLow: m.isLow,
        unit: m.GlucoseUnits === 1 ? "mg/dL" : "mmol/L",
        isRealtime: false, // Will be set to true for glucoseMeasurement
      };
    };

    const rawMeasurement = mapMeasurement(
      data.data.connection.glucoseMeasurement,
    );
    // Mark the real-time measurement as such
    const measurement = rawMeasurement
      ? { ...rawMeasurement, isRealtime: true }
      : null;

    const graphData = (data.data.connection.graphData || [])
      .map(mapMeasurement)
      .filter((m: any): m is GlucoseData => m !== null)
      .sort((a: any, b: any) => a.time - b.time);

    return {
      measurement,
      graph: graphData,
    };
  }
}
