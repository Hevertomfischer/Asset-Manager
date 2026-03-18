import { useGetCurrentRound, useGetProvidersStatus, useGetCurrentProjections } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, Clock, ShieldCheck, ShieldAlert, ArrowRight, Zap, Trophy } from "lucide-react";
import { getPositionColor } from "@/hooks/use-custom-api";
import { Link } from "wouter";

export default function Dashboard() {
  const { data: roundData, isLoading: roundLoading } = useGetCurrentRound();
  const { data: providersData } = useGetProvidersStatus();
  const { data: projectionsData, isLoading: projLoading } = useGetCurrentProjections({ round: roundData?.round || 1 });

  const providers = providersData?.providers || [];
  const projections = projectionsData?.projections || [];

  const getTopByPos = (pos: string, limit = 5) => {
    return projections
      .filter(p => p.player?.position === pos)
      .sort((a, b) => (b.recommendationScore || 0) - (a.recommendationScore || 0))
      .slice(0, limit);
  };

  const positions = ["ATA", "MEI", "LAT", "ZAG", "GOL", "TEC"];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Hero Section */}
      <div className="relative rounded-3xl overflow-hidden border border-border/50 shadow-2xl bg-card">
        <div className="absolute inset-0 z-0">
          <img 
            src={`${import.meta.env.BASE_URL}images/hero-bg.png`} 
            alt="Hero background" 
            className="w-full h-full object-cover opacity-40 mix-blend-screen"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/40 to-transparent" />
        </div>
        
        <div className="relative z-10 p-8 md:p-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-4 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 border border-primary/30 text-primary text-sm font-semibold shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              Intelligence Engine Active
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-extrabold text-white tracking-tight leading-tight">
              Dominate the <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Market</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
              Advanced machine learning projections and statistical optimization to build the perfect Cartola FC lineup.
            </p>
          </div>
          
          <Card className="w-full md:w-80 bg-background/60 backdrop-blur-xl border-border/50 shadow-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                Market Status
                {roundData?.marketOpen ? (
                  <ShieldCheck className="w-5 h-5 text-primary" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-destructive" />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {roundLoading ? (
                <div className="h-16 flex items-center justify-center text-muted-foreground">Loading...</div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-4xl font-display font-bold text-foreground">Round {roundData?.round || '?'}</span>
                    <Badge variant={roundData?.marketOpen ? "default" : "destructive"} className="shadow-lg font-bold px-3">
                      {roundData?.marketOpen ? 'OPEN' : 'CLOSED'}
                    </Badge>
                  </div>
                  {roundData?.closingDate && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary/50 p-2 rounded-lg border border-border">
                      <Clock className="w-4 h-4" />
                      Closes: {new Date(roundData.closingDate).toLocaleString()}
                    </div>
                  )}
                  <Button className="w-full shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all font-bold group" asChild>
                    <Link href="/lineup">
                      Optimize Lineup
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
            <h2 className="text-2xl font-display font-bold">Top Projections</h2>
          </div>
          
          {projLoading ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground bg-card rounded-2xl border border-border">Calculating projections...</div>
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
        </div>

        {/* Data Pipeline Status */}
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-accent" />
            <h2 className="text-2xl font-display font-bold">Data Pipeline</h2>
          </div>
          
          <div className="space-y-4">
            {providers.map(provider => (
              <Card key={provider.source} className="bg-card border-border/50 overflow-hidden">
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${
                      provider.status === 'ok' ? 'bg-primary shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 
                      provider.status === 'error' ? 'bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 
                      'bg-muted-foreground'
                    }`} />
                    <div>
                      <h4 className="font-semibold text-sm capitalize">{provider.source.replace('_', ' ')}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {provider.lastCollectedAt ? new Date(provider.lastCollectedAt).toLocaleTimeString() : 'Never synced'}
                      </p>
                    </div>
                  </div>
                  {provider.status === 'error' && (
                    <Badge variant="destructive" className="text-[10px]">Failed</Badge>
                  )}
                </div>
              </Card>
            ))}

            <Button variant="outline" className="w-full bg-secondary/30 hover:bg-secondary font-semibold" asChild>
              <Link href="/admin">
                <Zap className="w-4 h-4 ml-2 text-accent mr-2" />
                Manage Pipeline
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
