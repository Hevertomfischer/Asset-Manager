import { useGetCurrentRound, useGetProvidersStatus, useGetCurrentProjections, useGetCurrentMatches } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, Clock, ShieldCheck, ShieldAlert, ArrowRight, Zap, Trophy, AlertTriangle, Calendar } from "lucide-react";
import { getPositionColor } from "@/hooks/use-custom-api";
import { Link } from "wouter";

export default function Dashboard() {
  const { data: roundData, isLoading: roundLoading } = useGetCurrentRound();
  const { data: providersData } = useGetProvidersStatus();
  const { data: projectionsData, isLoading: projLoading } = useGetCurrentProjections({ round: roundData?.round || undefined });
  const { data: matchesData } = useGetCurrentMatches();

  const providers = providersData?.providers || [];
  const projections = projectionsData?.projections || [];
  const matches = matchesData?.matches || [];

  const getTopByPos = (pos: string, limit = 3) => {
    return projections
      .filter(p => (p.player as any)?.position === pos)
      .sort((a, b) => (b.recommendationScore || 0) - (a.recommendationScore || 0))
      .slice(0, limit);
  };

  const riskAlerts = projections
    .filter(p => {
      const availability = (p.player as any)?.availability;
      const prob = availability?.playProbability ?? 1;
      return prob < 0.5;
    })
    .sort((a, b) => {
      const probA = (a.player as any)?.availability?.playProbability ?? 1;
      const probB = (b.player as any)?.availability?.playProbability ?? 1;
      return probA - probB;
    })
    .slice(0, 6);

  const positions = ["ATA", "MEI", "LAT", "ZAG", "GOL", "TEC"];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Hero Section */}
      <div className="relative rounded-3xl overflow-hidden border border-border/50 shadow-2xl bg-card">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
        </div>
        
        <div className="relative z-10 p-8 md:p-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-4 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 border border-primary/30 text-primary text-sm font-semibold shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              Intelligence Engine Ativo
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-extrabold text-white tracking-tight leading-tight">
              Domine o <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Mercado</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
              Projeções avançadas e otimização estatística para montar o time perfeito no Cartola FC.
            </p>
          </div>
          
          <Card className="w-full md:w-80 bg-background/60 backdrop-blur-xl border-border/50 shadow-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                Status do Mercado
                {roundData?.marketOpen ? (
                  <ShieldCheck className="w-5 h-5 text-primary" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-destructive" />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {roundLoading ? (
                <div className="h-16 flex items-center justify-center text-muted-foreground">Carregando...</div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-4xl font-display font-bold text-foreground">Rodada {roundData?.round || '?'}</span>
                    <Badge variant={roundData?.marketOpen ? "default" : "destructive"} className="shadow-lg font-bold px-3">
                      {roundData?.marketOpen ? 'ABERTO' : 'FECHADO'}
                    </Badge>
                  </div>
                  {roundData?.closingDate && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary/50 p-2 rounded-lg border border-border">
                      <Clock className="w-4 h-4" />
                      Fecha: {new Date(roundData.closingDate).toLocaleString('pt-BR')}
                    </div>
                  )}
                  <Button className="w-full shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all font-bold group" asChild>
                    <Link href="/escalacao">
                      Otimizar Escalação
                      <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Top Players by Position */}
        <div className="col-span-1 lg:col-span-2 space-y-6">
          <div className="flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-display font-bold">Melhores Projeções</h2>
          </div>
          
          {projLoading ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground bg-card rounded-2xl border border-border">
              <div className="flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                Calculando projeções...
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {positions.map(pos => {
                const tops = getTopByPos(pos, 3);
                if (!tops.length) return null;
                
                return (
                  <Card key={pos} className="bg-card hover:border-border transition-colors group overflow-hidden">
                    <div className={`h-1 w-full bg-gradient-to-r ${pos === 'ATA' ? 'from-red-500' : pos === 'MEI' ? 'from-purple-500' : pos === 'LAT' ? 'from-cyan-500' : pos === 'ZAG' ? 'from-blue-500' : pos === 'GOL' ? 'from-yellow-500' : 'from-green-500'} to-transparent`} />
                    <CardHeader className="py-3 px-4 flex flex-row items-center justify-between bg-secondary/20">
                      <Badge variant="outline" className={`font-mono text-xs ${getPositionColor(pos)} border`}>
                        {pos}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Top 3</span>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y divide-border/50">
                        {tops.map((p, idx) => (
                          <div key={p.id} className="p-3 px-4 flex items-center justify-between hover:bg-secondary/40 transition-colors">
                            <div className="flex items-center gap-3 overflow-hidden">
                              <span className="text-xs font-bold text-muted-foreground w-3">{idx + 1}</span>
                              <div className="truncate">
                                <p className="font-semibold text-sm truncate text-foreground">{(p.player as any)?.name}</p>
                                <p className="text-xs text-muted-foreground truncate">{(p.player as any)?.club?.name}</p>
                              </div>
                            </div>
                            <div className="text-right pl-2 shrink-0">
                              <p className="font-bold text-primary font-mono">{(p.expectedPoints as number | null | undefined)?.toFixed(1)} <span className="text-[10px] text-muted-foreground">pts</span></p>
                              <p className="text-xs text-muted-foreground">C$ {(p.player as any)?.price?.toFixed(2)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Risk Alerts */}
          {riskAlerts.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                <h3 className="text-lg font-display font-bold">Alertas de Risco</h3>
                <span className="text-xs text-muted-foreground">(jogadores com baixa probabilidade de jogar)</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {riskAlerts.map(p => {
                  const player = p.player as any;
                  const prob = player?.availability?.playProbability ?? 0;
                  const riskScore = player?.availability?.riskScore ?? 0;
                  return (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-yellow-500/20">
                          <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{player?.name}</p>
                          <p className="text-xs text-muted-foreground">{player?.club?.name} · {player?.position}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono font-bold text-yellow-500">{(prob * 100).toFixed(0)}%</p>
                        <p className="text-[10px] text-muted-foreground">risco: {riskScore.toFixed(2)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar: Data Pipeline + Matches */}
        <div className="space-y-6">
          {/* Data Pipeline Status */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Activity className="w-6 h-6 text-accent" />
              <h2 className="text-2xl font-display font-bold">Pipeline</h2>
            </div>
            
            <div className="space-y-3">
              {providers.map(provider => (
                <Card key={provider.source} className="bg-card border-border/50 overflow-hidden">
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full ${
                        provider.status === 'ok' ? 'bg-primary shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 
                        provider.status === 'error' ? 'bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 
                        'bg-yellow-500'
                      }`} />
                      <div>
                        <h4 className="font-semibold text-sm capitalize">{provider.source.replace(/_/g, ' ')}</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {provider.lastCollectedAt ? new Date(provider.lastCollectedAt).toLocaleTimeString('pt-BR') : 'Nunca sincronizado'}
                        </p>
                      </div>
                    </div>
                    <Badge variant={provider.status === 'ok' ? 'default' : provider.status === 'error' ? 'destructive' : 'secondary'} className="text-[10px]">
                      {provider.status === 'ok' ? 'ok' : provider.status === 'error' ? 'erro' : 'degradado'}
                    </Badge>
                  </div>
                </Card>
              ))}

              <Button variant="outline" className="w-full bg-secondary/30 hover:bg-secondary font-semibold" asChild>
                <Link href="/admin">
                  <Zap className="w-4 h-4 ml-2 text-accent mr-2" />
                  Gerenciar Pipeline
                </Link>
              </Button>
            </div>
          </div>

          {/* Matches/Fixtures */}
          {matches.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                <h3 className="text-xl font-display font-bold">Partidas</h3>
              </div>
              <div className="space-y-2">
                {matches.slice(0, 6).map((match: any) => (
                  <Card key={match.id} className="bg-card border-border/50">
                    <div className="p-3 flex items-center justify-between gap-2">
                      <div className="flex-1 text-right">
                        <p className="font-semibold text-sm truncate">{match.homeClub?.name || match.homeClubId}</p>
                      </div>
                      <div className="px-2 py-1 rounded-lg bg-secondary text-xs font-bold font-mono text-muted-foreground whitespace-nowrap">
                        vs
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-semibold text-sm truncate">{match.awayClub?.name || match.awayClubId}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
