import { useState } from "react";
import { useGenerateLineup, type LineupSuggestion } from "@workspace/api-client-react";
import { useSaveLineup } from "@/hooks/use-custom-api";
import { Pitch } from "@/components/Pitch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Shield, Zap, Scale, Calculator, Loader2, Save, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Lineup() {
  const [formation, setFormation] = useState("4-3-3");
  const [strategy, setStrategy] = useState<"safe" | "aggressive" | "cost-benefit">("cost-benefit");
  const [budget, setBudget] = useState(100);
  
  const { toast } = useToast();
  const generateLineupMutation = useGenerateLineup();
  const saveLineupMutation = useSaveLineup();

  const [currentLineup, setCurrentLineup] = useState<LineupSuggestion | null>(null);

  const handleGenerate = () => {
    generateLineupMutation.mutate(
      { data: { budget, formation, strategy } },
      {
        onSuccess: (data) => {
          if (data.lineup) {
            setCurrentLineup(data.lineup);
            toast({
              title: "Lineup Generated",
              description: `Total expected points: ${(data.lineup.expectedPoints ?? 0).toFixed(1)}`,
            });
          }
        },
        onError: (error) => {
          toast({
            title: "Generation Failed",
            description: error.message || "Could not generate lineup with given constraints",
            variant: "destructive"
          });
        }
      }
    );
  };

  const handleSave = () => {
    if (!currentLineup?.id) return;
    saveLineupMutation.mutate(currentLineup.id, {
      onSuccess: () => {
        toast({ title: "Lineup Saved", description: "Lineup has been saved to database." });
      },
      onError: () => {
        toast({ title: "Failed to save", variant: "destructive" });
      }
    });
  };

  const strategies = [
    { value: "safe", label: "Safe (High Floor)", icon: Shield, desc: "Minimizes risk, selects consistent players." },
    { value: "aggressive", label: "Aggressive (High Ceiling)", icon: Zap, desc: "Maximizes potential points, accepts volatility." },
    { value: "cost-benefit", label: "Cost-Benefit", icon: Scale, desc: "Best point-per-currency ratio." }
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Controls Sidebar */}
      <div className="lg:col-span-4 space-y-6">
        <div className="mb-2">
          <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
            <Calculator className="w-8 h-8 text-primary" />
            Optimizer
          </h1>
          <p className="text-muted-foreground mt-1">Generate AI-optimized lineups based on your constraints.</p>
        </div>

        <Card className="bg-card shadow-xl border-border/50 rounded-2xl overflow-hidden">
          <CardHeader className="bg-secondary/30 border-b border-border/50 py-4">
            <CardTitle className="text-lg">Parameters</CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-6">
            
            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Formation</Label>
              <Select value={formation} onValueChange={setFormation}>
                <SelectTrigger className="h-12 bg-background border-border rounded-xl">
                  <SelectValue placeholder="Select formation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="4-4-2">4-4-2 (Balanced)</SelectItem>
                  <SelectItem value="4-3-3">4-3-3 (Attacking)</SelectItem>
                  <SelectItem value="3-5-2">3-5-2 (Midfield Control)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Strategy</Label>
              <div className="space-y-2">
                {strategies.map(s => {
                  const isActive = strategy === s.value;
                  return (
                    <button
                      key={s.value}
                      onClick={() => setStrategy(s.value as any)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-200 ${
                        isActive 
                          ? 'border-primary bg-primary/10 shadow-[0_0_10px_rgba(16,185,129,0.1)]' 
                          : 'border-border bg-background hover:border-muted-foreground/50'
                      }`}
                    >
                      <div className={`p-2 rounded-lg ${isActive ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                        <s.icon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className={`font-semibold ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>{s.label}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{s.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Max Budget</Label>
                <span className="text-lg font-mono font-bold text-primary">C$ {budget}</span>
              </div>
              <Slider 
                value={[budget]} 
                onValueChange={(v) => setBudget(v[0])} 
                max={200} 
                min={80}
                step={1}
                className="py-1"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                <span>C$ 80</span>
                <span>C$ 200</span>
              </div>
            </div>

            <Button 
              className="w-full h-14 rounded-xl text-lg font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/40 hover:-translate-y-0.5 transition-all bg-gradient-to-r from-primary to-accent"
              onClick={handleGenerate}
              disabled={generateLineupMutation.isPending}
            >
              {generateLineupMutation.isPending ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Generating...</>
              ) : (
                <><Download className="w-5 h-5 mr-2" /> Generate Lineup</>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Pitch Display */}
      <div className="lg:col-span-8 flex flex-col items-center">
        {currentLineup ? (
          <div className="w-full animate-in zoom-in-95 duration-500 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-card border border-border/50 p-4 rounded-2xl shadow-lg">
              <div className="flex gap-6">
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Expected Pts</p>
                  <p className="text-2xl font-mono font-bold text-primary">{(currentLineup.expectedPoints ?? 0).toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Total Cost</p>
                  <p className="text-2xl font-mono font-bold text-foreground">C$ {(currentLineup.totalCost ?? 0).toFixed(2)}</p>
                </div>
                <div className="hidden md:block">
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Formation</p>
                  <p className="text-2xl font-mono font-bold text-foreground">{currentLineup.formation}</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                className="rounded-xl border-border bg-secondary hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all shadow-md"
                onClick={handleSave}
                disabled={saveLineupMutation.isPending}
              >
                {saveLineupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <Save className="w-4 h-4 mr-2" />}
                Save Lineup
              </Button>
            </div>

            <Pitch 
              formation={(currentLineup.formation ?? "4-4-2") as string}
              players={(currentLineup.players ?? []).map((p: any) => ({
                id: p.playerId,
                name: p.name,
                position: p.position,
                expectedPoints: p.expectedPoints,
                price: p.price,
                isCaptain: p.isCaptain,
                // Passing empty club to fallback to abbreviation since lineup payload might not deep populate club
                club: { abbreviation: p.name.substring(0,3).toUpperCase() } 
              }))} 
            />
          </div>
        ) : (
          <div className="w-full h-[600px] border-2 border-dashed border-border/50 rounded-3xl flex flex-col items-center justify-center text-muted-foreground bg-card/30">
            <Shield className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-medium">No lineup generated</p>
            <p className="text-sm opacity-70 mt-1">Configure parameters and click generate</p>
          </div>
        )}
      </div>

    </div>
  );
}
