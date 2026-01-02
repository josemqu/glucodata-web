'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  ArrowUp, 
  ArrowUpRight, 
  ArrowRight, 
  ArrowDownRight, 
  ArrowDown, 
  AlertCircle, 
  Clock, 
  LogOut,
  RefreshCw,
  Droplets,
  User,
  Settings,
  ArrowLeft,
  ShieldCheck
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { getLatestGlucoseAction } from './actions';
import Cookies from 'js-cookie';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea
} from 'recharts';
import { ModeToggle } from '@/components/mode-toggle';

export default function GlucoPage() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [activeView, setActiveView] = useState<'dashboard' | 'settings'>('dashboard');

  const [session, setSession] = useState<any>(null);

  // Configuration state
  const [targetConfig, setTargetConfig] = useState({
    low: 70,
    high: 180,
    hypo: 60,
    hyper: 250
  });

  // Load session and config
  useEffect(() => {
    const savedSession = Cookies.get('gluco_session');
    const savedConfig = Cookies.get('gluco_config');

    if (savedConfig) {
      try {
        setTargetConfig(JSON.parse(savedConfig));
      } catch (e) {
        console.error("Error parsing config", e);
      }
    }

    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        setSession(parsed);
        fetchData(undefined, parsed).finally(() => {
          setIsInitializing(false);
        });
        return; 
      } catch (e) {
        Cookies.remove('gluco_session');
      }
    }
    setIsInitializing(false);
  }, []);

  const saveConfig = (newConfig: typeof targetConfig) => {
    setTargetConfig(newConfig);
    Cookies.set('gluco_config', JSON.stringify(newConfig), { expires: 365 });
  };

  const fetchData = async (creds = credentials, sessionData = session) => {
    setLoading(true);
    setError(null);
    const result = await getLatestGlucoseAction(creds.email, creds.password, sessionData);
    if (result.success) {
      setData(result.data);
      setIsLoggedIn(true);
      setLastFetch(new Date());
      
      const newSession = result.data?.session;
      if (newSession && newSession.token) {
        setSession(newSession);
        Cookies.set('gluco_session', JSON.stringify(newSession), { expires: 7 });
      }
    } else {
      setError(result.error);
      if (isLoggedIn) {
        setIsLoggedIn(false);
        Cookies.remove('gluco_session');
      }
    }
    setLoading(false);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData();
  };

  const handleLogout = () => {
    Cookies.remove('gluco_session');
    setIsLoggedIn(false);
    setData(null);
    setSession(null);
    setCredentials({ email: '', password: '' });
    setActiveView('dashboard');
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoggedIn && activeView === 'dashboard') {
      interval = setInterval(() => fetchData(), 60000); 
    }
    return () => clearInterval(interval);
  }, [isLoggedIn, credentials, activeView]);

  const getTrendIcon = (trend: number) => {
    const className = "w-6 h-6";
    switch (trend) {
      case 5: return <ArrowUp className={`${className} text-destructive`} />;
      case 4: return <ArrowUpRight className={`${className} text-orange-500`} />;
      case 3: return <ArrowRight className={`${className} text-emerald-500`} />;
      case 2: return <ArrowDownRight className={`${className} text-orange-400`} />;
      case 1: return <ArrowDown className={`${className} text-orange-600`} />;
      default: return null;
    }
  };

  const getGlucoseStatus = (val: number) => {
    if (val <= targetConfig.hypo) return { label: 'HIPO', color: 'text-red-500', badge: 'bg-red-500', isCritical: true };
    if (val < targetConfig.low) return { label: 'BAJA', color: 'text-amber-500', badge: 'bg-amber-500', isCritical: false };
    if (val >= targetConfig.hyper) return { label: 'HIPER', color: 'text-red-500', badge: 'bg-red-500', isCritical: true };
    if (val > targetConfig.high) return { label: 'ALTA', color: 'text-amber-500', badge: 'bg-amber-500', isCritical: false };
    return { label: 'OBJETIVO', color: 'text-emerald-500', badge: 'text-emerald-500 border-emerald-500/20 bg-emerald-500/5', isCritical: false };
  };

  const [timeRange, setTimeRange] = useState(24); // hours
  const [showLine, setShowLine] = useState(true);

  const getGlucoseColor = (val: number) => {
    if (val === undefined || val === null) return '#94a3b8';
    if (val <= targetConfig.hypo) return '#ef4444';
    if (val < targetConfig.low) return '#f59e0b';
    if (val >= targetConfig.hyper) return '#ef4444';
    if (val > targetConfig.high) return '#f59e0b';
    return '#10b981';
  };

  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    const val = payload?.value;
    if (cx === undefined || cy === undefined || val === undefined) return null;
    return (
      <circle 
        cx={cx} 
        cy={cy} 
        r={2.5} 
        fill={getGlucoseColor(val)} 
        stroke="var(--background)" 
        strokeWidth={1} 
      />
    );
  };

  if (isInitializing) {
    return (
      <main className="h-screen bg-background flex flex-col items-center justify-center p-4 overflow-hidden">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-6"
        >
          <div className="relative">
            <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center animate-pulse">
              <Droplets className="w-10 h-10 text-primary animate-bounce" />
            </div>
            <div className="absolute inset-0 border-4 border-primary/20 border-t-primary rounded-3xl animate-spin" />
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-black tracking-tighter italic">GLUCOWEB</h2>
            <div className="flex items-center gap-2 justify-center mt-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <p className="text-muted-foreground text-[10px] uppercase tracking-[0.3em] font-bold">Sincronizando</p>
            </div>
          </div>
        </motion.div>
      </main>
    );
  }

  if (!isLoggedIn) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          <Card className="border-border shadow-lg">
            <CardHeader className="text-center pb-6">
              <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/20 rotate-3">
                <Droplets className="w-8 h-8 text-primary-foreground" />
              </div>
              <CardTitle className="text-3xl font-bold tracking-tight italic">GLUCOWEB</CardTitle>
              <CardDescription className="text-[10px] uppercase tracking-widest font-bold">
                Med-Analytics Interface
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Email</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="usuario@ejemplo.com" 
                    className="bg-muted/30 border-muted-foreground/20"
                    value={credentials.email}
                    onChange={(e) => setCredentials({ ...credentials, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Contraseña</Label>
                  <Input 
                    id="password" 
                    type="password"
                    className="bg-muted/30 border-muted-foreground/20"
                    value={credentials.password}
                    onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                    required
                  />
                </div>
                {error && (
                  <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-[10px] font-bold uppercase tracking-widest border border-destructive/20 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </div>
                )}
                <Button 
                  type="submit" 
                  className="w-full font-bold h-11 text-xs tracking-[0.1em]"
                  disabled={loading}
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : 'ACCEDER AL PANEL'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    );
  }

  if (!data) return null;

  const { glucose, patient, graph } = data;
  const unit = glucose?.unit || 'mg/dL';
  const status = getGlucoseStatus(glucose.value);

  const filteredGraph = graph ? graph.filter((p: any) => {
    const hoursAgo = (new Date().getTime() - p.time) / (1000 * 60 * 60);
    return hoursAgo <= timeRange;
  }) : [];

  const stats = filteredGraph.length > 0 ? {
    avg: Math.round(filteredGraph.reduce((acc: number, p: any) => acc + p.value, 0) / filteredGraph.length),
    max: Math.max(...filteredGraph.map((p: any) => p.value)),
    min: Math.min(...filteredGraph.map((p: any) => p.value)),
    inRange: Math.round((filteredGraph.filter((p: any) => p.value >= targetConfig.low && p.value <= targetConfig.high).length / filteredGraph.length) * 100)
  } : null;

  const yMin = 35;
  const yMax = 320;
  const getOffset = (val: number) => {
    const offset = 1 - (val - yMin) / (yMax - yMin);
    return `${Math.max(0, Math.min(100, offset * 100))}%`;
  };

  return (
    <main className="h-screen flex flex-col bg-background text-foreground transition-colors duration-300 overflow-hidden text-xs">
      {/* Header */}
      <header className="flex-none px-4 py-2 border-b bg-background/80 backdrop-blur-md z-10">
        <div className="max-w-[1100px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/10">
              <Droplets className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="flex flex-col cursor-pointer" onClick={() => setActiveView('dashboard')}>
              <h1 className="text-base font-black tracking-tighter leading-none italic">GLUCOWEB</h1>
              <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest leading-none mt-0.5 opacity-60">PRO INTERFACE V2.5</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-[0.2em] leading-none mb-1">Monitorización Activa</p>
              <p className="font-bold text-xs leading-none">{patient.firstName} {patient.lastName}</p>
            </div>
            <div className="flex items-center gap-2 border-l pl-4 border-border/50">
              <ModeToggle />
              <Button 
                variant="ghost" 
                size="icon"
                className={`w-8 h-8 rounded-md transition-colors ${activeView === 'settings' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
                onClick={() => setActiveView(activeView === 'dashboard' ? 'settings' : 'dashboard')}
              >
                <Settings className="w-4 h-4" />
                <span className="sr-only">Configuración</span>
              </Button>
              <Button 
                variant="ghost" 
                size="icon"
                className="w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4" />
                <span className="sr-only">Cerrar Sesión</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 md:p-4 bg-muted/5">
        <div className="max-w-[1100px] mx-auto h-full">
          
          {activeView === 'dashboard' ? (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="h-full flex flex-col space-y-3"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1">
                {/* Left Column - Main View */}
                <div className="lg:col-span-9 flex flex-col gap-3 min-w-0 h-full">
                  {/* Top Metrics Bar */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    <Card className="relative overflow-hidden border bg-card/50 shadow-sm md:col-span-6">
                      <div className={`absolute top-0 left-0 bottom-0 w-1 ${status.label === 'OBJETIVO' ? 'bg-emerald-500' : status.badge}`} />
                      <CardContent className="p-3.5 flex items-center justify-between">
                        <div>
                          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Sensing Real-Time</p>
                          <div className="flex items-baseline gap-1.5">
                            <motion.span
                              key={glucose.value}
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className={`text-5xl font-black tabular-nums tracking-tighter ${status.color}`}
                            >
                              {glucose.value}
                            </motion.span>
                            <span className="text-[10px] font-bold text-muted-foreground opacity-60 uppercase">{unit}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <div className="flex gap-1.5">
                            <Badge variant={status.label === 'OBJETIVO' ? 'outline' : 'default'} className={`${status.badge} ${status.label === 'OBJETIVO' ? '' : 'text-white'} px-2 py-0.5 text-[8px] font-bold rounded-sm uppercase tracking-wider`}>
                              {status.label}
                            </Badge>
                            <div className="p-1.5 bg-muted rounded-md border border-border/50">
                              {getTrendIcon(glucose.trend)}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border bg-card/30 md:col-span-3">
                      <CardContent className="p-3.5 space-y-1.5">
                        <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Time in Range</p>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-black text-emerald-500 tabular-nums">{stats?.inRange}%</span>
                          <span className="text-[8px] text-muted-foreground font-bold">OPTIMAL</span>
                        </div>
                        <div className="w-full bg-muted h-1 rounded-full overflow-hidden">
                          <div className="bg-emerald-500 h-full" style={{ width: `${stats?.inRange}%` }} />
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border bg-card/30 md:col-span-3">
                      <CardContent className="p-3.5 space-y-1">
                        <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Avg Glucose</p>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-black tabular-nums">{stats?.avg}</span>
                          <span className="text-[8px] text-muted-foreground font-bold uppercase">{unit}</span>
                        </div>
                        <div className="flex justify-between text-[8px] font-bold mt-1 text-muted-foreground opacity-60">
                          <span>↓ {stats?.min}</span>
                          <span>↑ {stats?.max}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Chart Card */}
                  <Card className="shadow-sm border flex flex-col flex-1 min-h-[320px] overflow-hidden bg-card/20">
                    <CardHeader className="flex flex-row items-center justify-between py-2 px-4 border-b bg-muted/20">
                      <div className="flex flex-col">
                        <CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80 flex items-center gap-2">
                           Historial Analítico
                          <span className="text-[8px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{timeRange}H Window</span>
                        </CardTitle>
                      </div>
                      
                      {/* Time Filters */}
                      <div className="flex items-center gap-2">
                        <div className="flex items-center bg-muted/50 p-0.5 rounded-lg border border-border/50">
                          {[1, 6, 12, 24].map((h) => (
                            <button
                              key={h}
                              onClick={() => setTimeRange(h)}
                              className={`px-3 py-1 text-[9px] font-bold transition-all rounded-md ${
                                timeRange === h 
                                  ? 'bg-background text-primary shadow-sm' 
                                  : 'text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              {h}H
                            </button>
                          ))}
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className={`h-7 px-3 text-[9px] font-bold uppercase tracking-wider border transition-all ${showLine ? 'bg-primary/10 text-primary border-primary/20' : 'text-muted-foreground border-border/50 hover:bg-muted'}`}
                          onClick={() => setShowLine(!showLine)}
                        >
                          {showLine ? 'Ocultar Línea' : 'Mostrar Línea'}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 p-0 pt-4 flex flex-col">
                      <div className="flex-1 min-h-0">
                        <ResponsiveContainer width="100%" height="95%">
                          <AreaChart data={filteredGraph} margin={{ top: 15, right: 5, left: -20, bottom: 0 }}>
                            <defs>
                              <linearGradient id="colorGluc" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--muted-foreground)" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="var(--muted-foreground)" stopOpacity={0}/>
                              </linearGradient>
                              <linearGradient id="lineGluc" x1="0" y1="0" x2="0" y2="1">
                                <stop offset={getOffset(yMax)} stopColor="#ef4444" />
                                <stop offset={getOffset(targetConfig.hyper)} stopColor="#ef4444" />
                                <stop offset={getOffset(targetConfig.hyper)} stopColor="#f59e0b" />
                                <stop offset={getOffset(targetConfig.high)} stopColor="#f59e0b" />
                                <stop offset={getOffset(targetConfig.high)} stopColor="#10b981" />
                                <stop offset={getOffset(targetConfig.low)} stopColor="#10b981" />
                                <stop offset={getOffset(targetConfig.low)} stopColor="#f59e0b" />
                                <stop offset={getOffset(targetConfig.hypo)} stopColor="#f59e0b" />
                                <stop offset={getOffset(targetConfig.hypo)} stopColor="#ef4444" />
                                <stop offset={getOffset(yMin)} stopColor="#ef4444" />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="5 5" vertical={false} stroke="var(--muted)" opacity={0.15} />
                            <XAxis 
                              dataKey="time" 
                              type="number"
                              domain={['dataMin', 'dataMax']}
                              tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              stroke="var(--foreground)"
                              fontSize={10}
                              fontWeight="600"
                              tickLine={false}
                              axisLine={false}
                              minTickGap={40}
                            />
                            <YAxis 
                              stroke="var(--foreground)"
                              fontSize={10}
                              fontWeight="600"
                              tickLine={false}
                              axisLine={false}
                              domain={[yMin, yMax]}
                              ticks={[40, 70, 100, 140, 180, 220, 260, 300]}
                              orientation="right"
                            />
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: 'var(--card)', 
                                borderColor: 'var(--border)',
                                borderRadius: '6px',
                                fontSize: '10px',
                                padding: '10px',
                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                              }}
                              itemStyle={{ color: 'var(--foreground)', padding: '0' }}
                              labelStyle={{ color: 'var(--muted-foreground)', fontWeight: 'bold', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                              labelFormatter={(t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              formatter={(v: any) => [`${v} ${unit}`, 'GLUCOSA']}
                            />
                            
                            {/* Background Bands */}
                            <ReferenceArea y1={targetConfig.hyper} y2={yMax} fill="#ef4444" fillOpacity={0.03} />
                            <ReferenceArea y1={targetConfig.high} y2={targetConfig.hyper} fill="#f59e0b" fillOpacity={0.02} />
                            <ReferenceArea y1={targetConfig.low} y2={targetConfig.high} fill="#10b981" fillOpacity={0.05} />
                            <ReferenceArea y1={targetConfig.hypo} y2={targetConfig.low} fill="#f59e0b" fillOpacity={0.02} />
                            <ReferenceArea y1={yMin} y2={targetConfig.hypo} fill="#ef4444" fillOpacity={0.03} />
                            
                            <ReferenceLine 
                              y={targetConfig.hyper} 
                              stroke="#ef4444" 
                              strokeDasharray="6 3" 
                              strokeWidth={1}
                              opacity={0.6} 
                              label={{ 
                                value: 'HIPER', 
                                position: 'insideTopRight', 
                                fill: '#ef4444', 
                                fontSize: 9, 
                                fontWeight: '900',
                                dy: -10
                              }} 
                            />
                            <ReferenceLine 
                              y={targetConfig.high} 
                              stroke="#f59e0b" 
                              strokeDasharray="6 3" 
                              strokeWidth={1}
                              opacity={0.6} 
                              label={{ 
                                value: 'ALTA', 
                                position: 'insideTopRight', 
                                fill: '#f59e0b', 
                                fontSize: 9, 
                                fontWeight: '900',
                                dy: -10
                              }} 
                            />
                            <ReferenceLine 
                              y={targetConfig.low} 
                              stroke="#f59e0b" 
                              strokeDasharray="6 3" 
                              strokeWidth={1}
                              opacity={0.6} 
                              label={{ 
                                value: 'BAJA', 
                                position: 'insideTopRight', 
                                fill: '#f59e0b', 
                                fontSize: 9, 
                                fontWeight: '900',
                                dy: -10
                              }} 
                            />
                            {targetConfig.hypo > 40 && (
                              <ReferenceLine 
                                y={targetConfig.hypo} 
                                stroke="#ef4444" 
                                strokeDasharray="3 2" 
                                strokeWidth={1}
                                opacity={0.6} 
                                label={{ 
                                  value: 'HIPO', 
                                  position: 'insideBottomRight', 
                                  fill: '#ef4444', 
                                  fontSize: 9, 
                                  fontWeight: '900',
                                  dy: 10
                                }} 
                              />
                            )}
                            
                            <Area 
                              type="monotone" 
                              dataKey="value" 
                              stroke="url(#lineGluc)" 
                              strokeWidth={2.5}
                              strokeOpacity={showLine ? 1 : 0}
                              fillOpacity={1} 
                              fill="url(#colorGluc)" 
                              animationDuration={800}
                              dot={<CustomDot />}
                              activeDot={{ r: 4, strokeWidth: 2, fill: '#94a3b8', stroke: 'var(--background)' }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      
                      <div className="px-4 py-2 border-t bg-muted/5 flex items-center justify-between text-[8px] font-bold text-muted-foreground uppercase tracking-widest">
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Target Zone ({targetConfig.low}-{targetConfig.high})</span>
                          <span className="flex items-center gap-1.5 opacity-50"><div className="w-4 h-[1px] bg-muted-foreground border-t border-dashed" /> Reference Limits</span>
                        </div>
                        <div className="flex gap-4 opacity-50">
                          <span>Telemetry Pts: {filteredGraph.length}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Right Column - Sidemenu */}
                <div className="lg:col-span-3 flex flex-col gap-3">
                  <Card className="border shadow-none bg-card/40">
                    <CardHeader className="py-2.5 px-4 border-b bg-muted/10">
                      <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Health Diagnostics</p>
                    </CardHeader>
                    <CardContent className="p-4 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0 border border-orange-500/10">
                          <Clock className="w-4 h-4 text-orange-600" />
                        </div>
                        <div>
                          <p className="text-[8px] font-bold text-muted-foreground uppercase leading-none mb-1 opacity-60">Last sync</p>
                          <p className="text-base font-black tabular-nums">
                            {glucose ? new Date(glucose.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/10">
                          <RefreshCw className={`w-4 h-4 text-emerald-600 ${loading ? 'animate-spin' : ''}`} />
                        </div>
                        <div>
                          <p className="text-[8px] font-bold text-muted-foreground uppercase leading-none mb-1 opacity-60">Telemetry Status</p>
                          <p className="text-xs font-bold text-emerald-600 uppercase tracking-tight">Active link</p>
                        </div>
                      </div>
                      
                      <Separator className="opacity-30" />
                      
                      <div className="space-y-3 pt-1">
                        <Button 
                          className="w-full h-9 text-[9px] font-bold uppercase tracking-[0.15em] shadow-sm active:scale-95 transition-transform"
                          onClick={() => fetchData()}
                          disabled={loading}
                          variant="secondary"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} />
                          Sync Manual
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Patient Profile Snapshot */}
                  <Card className="border shadow-none mt-auto bg-muted/10">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-background flex items-center justify-center border shadow-sm">
                          <User className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[7px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Clinical Profile</p>
                          <p className="text-[11px] font-black truncate uppercase tracking-tight">{patient.firstName} {patient.lastName}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="max-w-2xl mx-auto py-4"
            >
              <div className="flex items-center gap-3 mb-6">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setActiveView('dashboard')}
                  className="rounded-full"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <div>
                  <h2 className="text-xl font-black italic tracking-tight">CONFIGURACIÓN DE RANGOS</h2>
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Ajuste de umbrales clínicos personalizados</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border bg-card/40 md:col-span-2">
                  <CardHeader className="pb-3 px-6 pt-6 flex flex-row items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-black uppercase tracking-tight">Umbrales de Control</CardTitle>
                      <CardDescription className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Define los límites para alertas y análisis</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-red-500">HIPO</Label>
                          <Badge className="bg-red-500 h-4 text-[8px] font-black">CRÍTICO</Badge>
                        </div>
                        <Input 
                          type="number" 
                          value={targetConfig.hypo}
                          onChange={(e) => saveConfig({...targetConfig, hypo: parseInt(e.target.value)})}
                          className="bg-muted/50 font-black tabular-nums h-12 text-lg"
                        />
                        <p className="text-[7px] text-muted-foreground font-medium italic opacity-60">Umbral hipoglucemia grave</p>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-amber-500">Bajo</Label>
                          <Badge className="bg-amber-500 h-4 text-[8px] font-black">WARNING</Badge>
                        </div>
                        <Input 
                          type="number" 
                          value={targetConfig.low}
                          onChange={(e) => saveConfig({...targetConfig, low: parseInt(e.target.value)})}
                          className="bg-muted/50 font-black tabular-nums h-12 text-lg"
                        />
                        <p className="text-[7px] text-muted-foreground font-medium italic opacity-60">Inicio de rango objetivo</p>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-amber-500">Alto</Label>
                          <Badge className="bg-amber-500 h-4 text-[8px] font-black">WARNING</Badge>
                        </div>
                        <Input 
                          type="number" 
                          value={targetConfig.high}
                          onChange={(e) => saveConfig({...targetConfig, high: parseInt(e.target.value)})}
                          className="bg-muted/50 font-black tabular-nums h-12 text-lg"
                        />
                        <p className="text-[7px] text-muted-foreground font-medium italic opacity-60">Fin de rango objetivo</p>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-red-500">HIPER</Label>
                          <Badge className="bg-red-500 h-4 text-[8px] font-black">CRÍTICO</Badge>
                        </div>
                        <Input 
                          type="number" 
                          value={targetConfig.hyper}
                          onChange={(e) => saveConfig({...targetConfig, hyper: parseInt(e.target.value)})}
                          className="bg-muted/50 font-black tabular-nums h-12 text-lg"
                        />
                        <p className="text-[7px] text-muted-foreground font-medium italic opacity-60">Umbral hiperglucemia grave</p>
                      </div>
                    </div>

                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                      <div className="flex gap-3">
                        <AlertCircle className="w-5 h-5 text-primary shrink-0" />
                        <div className="space-y-1">
                          <p className="text-[10px] font-black uppercase tracking-widest text-primary">Información de Sistema</p>
                          <p className="text-[9px] text-muted-foreground leading-relaxed">
                            Estos valores afectan directamente a los cálculos de <strong>Time in Range</strong>, las alertas visuales de colores y las líneas de referencia en el gráfico analítico. Los cambios se guardan automáticamente en tu sesión local.
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border bg-card/10 md:col-span-2">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Estado de Sincronización</p>
                      <p className="text-[10px] font-black">ALMACENAMIENTO LOCAL ACTIVO</p>
                    </div>
                    <Button 
                      variant="outline" 
                      className="h-8 text-[9px] font-black uppercase tracking-widest border-primary/20 text-primary hover:bg-primary/10"
                      onClick={() => setActiveView('dashboard')}
                    >
                      Volver al Panel
                      <ArrowRight className="ml-2 w-3.5 h-3.5" />
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          )}

        </div>
      </div>

      {/* Footer */}
      <footer className="flex-none px-4 py-1.5 border-t bg-background z-10">
        <div className="max-w-[1100px] mx-auto flex justify-between items-center text-muted-foreground">
          <p className="text-[7px] font-bold tracking-[0.4em] uppercase opacity-30">GlucoWeb Biomedical Interface • Engine v2.5.0-Release</p>
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-1.5 opacity-40">
              <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[7px] font-bold tracking-[0.2em] uppercase text-emerald-500">Secure AES-256 Protocol</span>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Separator({ className }: { className?: string }) {
  return <div className={`h-[1px] w-full bg-border ${className}`} />
}
