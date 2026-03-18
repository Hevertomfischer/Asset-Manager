import { useState, useEffect } from "react";
import { 
  useLogs, 
  useProjectionWeights, 
  useUpdateProjectionWeights,
  useSyncFull,
  useSyncMarket
} from "@/hooks/use-custom-api";
import { useGetProvidersStatus, useRecalculateProjections } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Settings, RefreshCw, Database, TerminalSquare, Save, Loader2, Play } from "lucide-react";

export default function Admin() {
  const { toast } = useToast();
  
  // Data hooks
  const { data: logsData } = useLogs(20);
  const { data: weightsData } = useProjectionWeights();
  const { data: providersData } = useGetProvidersStatus();
  
  // Mutations
  const updateWeights = useUpdateProjectionWeights();
  const syncFull = useSyncFull();
  const syncMarket = useSyncMarket();
  const recalcProjections = useRecalculateProjections();

  // Local state for weights form
  const [weights, setWeights] = useState<Record<string, number>>({
    formWeight: 0.3,
    availabilityWeight: 0.3,
    fixtureWeight: 0.2,
    valueWeight: 0.1,
    historyWeight: 0.1
  });

  useEffect(() => {
    if (weightsData?.weights) {
      setWeights(weightsData.weights);
    }
  }, [weightsData]);

  const handleSaveWeights = () => {
    updateWeights.mutate(weights, {
      onSuccess: () => toast({ title: "Weights updated successfully" }),
      onError: (err) => toast({ title: "Update failed", description: err.message, variant: "destructive" })
    });
  };

  const handleRecalc = () => {
    recalcProjections.mutate(undefined, {
      onSuccess: (data) => toast({ title: "Recalculated", description: data.message }),
      onError: (err) => toast({ title: "Recalc failed", description: err.message, variant: "destructive" })
    });
  };

  const handleSync = (type: 'full' | 'market') => {
    const mutation = type === 'full' ? syncFull : syncMarket;
    mutation.mutate(undefined, {
      onSuccess: () => toast({ title: `${type.toUpperCase()} Sync triggered` }),
      onError: (err) => toast({ title: "Sync failed", description: err.message, variant: "destructive" })
    });
  };

  const logs = logsData?.logs || [];
  const providers = providersData?.providers || [];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
          <Settings className="w-8 h-8 text-primary" />
          System Administration
        </h1>
        <p className="text-muted-foreground mt-1">Manage projection engine weights, data pipelines, and system logs.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        
        {/* Engine Configuration */}
        <Card className="bg-card shadow-lg border-border/50">
          <CardHeader className="bg-secondary/20 border-b border-border/50">
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-accent" />
              Engine Configuration
            </CardTitle>
            <CardDescription>Adjust the weights used by the projection ML algorithm.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="space-y-6">
              {Object.entries(weights).map(([key, value]) => (
                <div key={key} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold capitalize text-foreground">
                      {key.replace('Weight', '')} Weight
                    </Label>
                    <span className="font-mono text-sm text-primary font-bold">{value.toFixed(2)}</span>
                  </div>
                  <Slider 
                    value={[value]} 
                    max={1} 
                    min={0} 
                    step={0.05} 
                    onValueChange={(v) => setWeights(prev => ({ ...prev, [key]: v[0] }))}
                  />
                </div>
              ))}
            </div>
            
            <div className="pt-4 border-t border-border/50 flex gap-4">
              <Button 
                onClick={handleSaveWeights} 
                disabled={updateWeights.isPending}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {updateWeights.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Weights
              </Button>
              <Button 
                variant="secondary"
                onClick={handleRecalc} 
                disabled={recalcProjections.isPending}
                className="flex-1 border border-border"
              >
                {recalcProjections.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Recalculate Now
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Data Pipeline Management */}
        <Card className="bg-card shadow-lg border-border/50">
          <CardHeader className="bg-secondary/20 border-b border-border/50">
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-primary" />
              Pipeline Controls
            </CardTitle>
            <CardDescription>Trigger manual data ingestion and view source status.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <Button 
                variant="outline" 
                className="h-20 flex flex-col items-center justify-center gap-2 border-border hover:border-primary hover:bg-primary/5 transition-all"
                onClick={() => handleSync('full')}
                disabled={syncFull.isPending}
              >
                {syncFull.isPending ? <Loader2 className="w-6 h-6 animate-spin text-primary" /> : <Play className="w-6 h-6 text-primary" />}
                <span className="font-semibold">Run Full Sync</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-20 flex flex-col items-center justify-center gap-2 border-border hover:border-accent hover:bg-accent/5 transition-all"
                onClick={() => handleSync('market')}
                disabled={syncMarket.isPending}
              >
                {syncMarket.isPending ? <Loader2 className="w-6 h-6 animate-spin text-accent" /> : <Play className="w-6 h-6 text-accent" />}
                <span className="font-semibold">Run Market Sync</span>
              </Button>
            </div>

            <div className="space-y-3 pt-4">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Provider Status</Label>
              <div className="space-y-2">
                {providers.map((p: any) => (
                  <div key={p.source} className="flex items-center justify-between p-3 rounded-lg border border-border bg-background">
                    <span className="font-medium text-sm capitalize">{p.source.replace('_', ' ')}</span>
                    <Badge variant={p.status === 'ok' ? 'default' : p.status === 'error' ? 'destructive' : 'secondary'}>
                      {p.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Logs */}
      <Card className="bg-card shadow-lg border-border/50">
        <CardHeader className="bg-secondary/20 border-b border-border/50">
          <CardTitle className="flex items-center gap-2">
            <TerminalSquare className="w-5 h-5 text-muted-foreground" />
            System Event Logs
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead className="w-[180px]">Timestamp</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Round</TableHead>
                  <TableHead className="w-1/2">Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                      No logs available
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log: any, i: number) => (
                    <TableRow key={i} className="border-border/30 hover:bg-secondary/20 transition-colors">
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {new Date(log.collectedAt || log.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs font-semibold capitalize">{log.source?.replace('_', ' ')}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] uppercase border ${
                          log.status === 'success' || log.status === 'ok' ? 'text-green-500 border-green-500/30 bg-green-500/10' :
                          log.status === 'error' ? 'text-red-500 border-red-500/30 bg-red-500/10' :
                          'text-yellow-500 border-yellow-500/30 bg-yellow-500/10'
                        }`}>
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{log.round || '-'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-md truncate" title={log.message}>
                        {log.message}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
