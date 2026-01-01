import crypto from 'crypto';

export interface GlucoseData {
  value: number;
  trend: number;
  trendMessage?: string;
  time: number;
  isHigh: boolean;
  isLow: boolean;
  unit: string; // 'mg/dL'
}

export interface Patient {
  patientId: string;
  firstName: string;
  lastName: string;
}

export class LibreLinkUpClient {
  private token: string = '';
  private userId: string = '';
  private region: string = '';
  private topLevelDomain: string = 'io';
  private apiVersion: string = '4.17.0';
  private product: string = 'llu.android';

  constructor(
    private email?: string,
    private password?: string,
    region?: string,
    token?: string,
    userId?: string
  ) {
    if (region) this.region = region;
    if (token) this.token = token;
    if (userId) this.userId = userId;
  }

  public getSession() {
    return {
      token: this.token,
      userId: this.userId,
      region: this.region
    };
  }

  private encryptSHA256(value: string): string {
    return crypto.createHash('sha256').update(value.trim()).digest('hex');
  }

  private getUrl(endpoint: string): string {
    const baseUrl = this.region 
      ? `https://api-${this.region}.libreview.${this.topLevelDomain}`
      : `https://api.libreview.${this.topLevelDomain}`;
    return baseUrl + endpoint;
  }

  private getHeaders() {
    const headers: Record<string, string> = {
      'product': this.product,
      'version': this.apiVersion,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'cache-control': 'no-cache',
    };

    if (this.userId) {
      headers['Account-Id'] = this.encryptSHA256(this.userId);
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return headers;
  }

  async login(): Promise<void> {
    if (!this.email || !this.password) {
      throw new Error('Email and password are required for login');
    }

    const response = await fetch(this.getUrl('/llu/auth/login'), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        email: this.email,
        password: this.password,
      }),
    });

    const data = await response.json();

    if (data.status === 0 && data.data?.redirect && data.data?.region) {
      this.region = data.data.region;
      return this.login();
    }

    if (data.status !== 0) {
      throw new Error(data.error?.message || `Login failed with status ${data.status}`);
    }

    this.token = data.data.authTicket.token;
    this.userId = data.data.user.id;
  }

  async getConnections(): Promise<Patient[]> {
    if (!this.token) await this.login();

    const response = await fetch(this.getUrl('/llu/connections'), {
      headers: this.getHeaders(),
    });

    const data = await response.json();

    if (data.status !== 0) {
      throw new Error(data.error?.message || 'Failed to get connections');
    }

    return data.data.map((conn: any) => ({
      patientId: conn.patientId,
      firstName: conn.firstName,
      lastName: conn.lastName,
    }));
  }

  async getGlucose(patientId: string): Promise<{ measurement: GlucoseData, graph: GlucoseData[] }> {
    if (!this.token) await this.login();

    const response = await fetch(this.getUrl(`/llu/connections/${patientId}/graph`), {
      headers: this.getHeaders(),
    });

    const data = await response.json();

    if (data.status !== 0) {
      throw new Error(data.error?.message || 'Failed to get glucose data');
    }

    const mapMeasurement = (m: any): GlucoseData | null => {
      if (!m) return null;
      return {
        value: m.ValueInMgPerDl,
        trend: m.TrendArrow,
        time: m.Timestamp ? new Date(m.Timestamp).getTime() : Date.now(),
        isHigh: m.isHigh,
        isLow: m.isLow,
        unit: m.GlucoseUnits === 1 ? 'mg/dL' : 'mmol/L',
      };
    };

    const measurement = mapMeasurement(data.data.connection.glucoseMeasurement);
    const graphData = (data.data.connection.graphData || [])
      .map(mapMeasurement)
      .filter((m: any): m is GlucoseData => m !== null)
      .sort((a: any, b: any) => a.time - b.time);

    return {
      measurement: measurement || (graphData.length > 0 ? graphData[graphData.length - 1] : null),
      graph: graphData,
    };
  }
}
