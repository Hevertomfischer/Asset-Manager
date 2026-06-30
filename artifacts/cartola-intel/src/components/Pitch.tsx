import { FC } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getPositionColor } from "@/hooks/use-custom-api";

interface PlayerOnPitch {
  id: number;
  name: string;
  position: string;
  expectedPoints?: number;
  price?: number;
  isCaptain?: boolean;
  club?: {
    badgeUrl?: string;
    abbreviation?: string;
  };
}

interface PitchProps {
  formation: string;
  players: PlayerOnPitch[];
}

export const Pitch: FC<PitchProps> = ({ formation, players }) => {
  // Parse formation, e.g., "4-4-2" -> [4, 4, 2]
  const rows = formation.split("-").map(Number);
  
  const getPlayersByPos = (positions: string[]) => 
    players.filter(p => positions.includes(p.position));

  const gk = getPlayersByPos(["GOL"]).slice(0, 1);
  const def = getPlayersByPos(["ZAG", "LAT"]).slice(0, rows[0] || 0);
  const mid = getPlayersByPos(["MEI"]).slice(0, rows[1] || 0);
  const att = getPlayersByPos(["ATA"]).slice(0, rows[2] || 0);
  const tec = getPlayersByPos(["TEC"]).slice(0, 1);

  const PlayerCard = ({ player }: { player: PlayerOnPitch }) => (
    <div className="flex flex-col items-center group relative z-10 w-20">
      <div className={`relative rounded-full p-0.5 border-2 ${player.isCaptain ? 'border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.6)]' : 'border-white/20'} bg-black/40 backdrop-blur-md transition-transform duration-300 group-hover:scale-110`}>
        {player.isCaptain && (
          <div className="absolute -top-2 -right-2 bg-yellow-400 text-black w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold z-20">
            C
          </div>
        )}
        <Avatar className="w-10 h-10 border border-white/10">
          <AvatarImage src={player.club?.badgeUrl} />
          <AvatarFallback className="bg-white/10 text-xs">{player.club?.abbreviation || '??'}</AvatarFallback>
        </Avatar>
      </div>
      
      <div className="mt-1 flex flex-col items-center bg-black/60 backdrop-blur-md rounded-md px-1.5 py-0.5 border border-white/10 w-full">
        <span className="text-[10px] font-bold text-white truncate w-full text-center tracking-tight">
          {player.nickname ?? player.name.split(' ')[0]}
        </span>
        <div className="flex gap-1 items-center mt-0.5">
          <span className={`text-[9px] font-mono px-1 rounded-sm ${getPositionColor(player.position)}`}>
            {player.position}
          </span>
          {player.expectedPoints !== undefined && (
            <span className="text-[9px] text-primary font-bold">
              {player.expectedPoints.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative w-full max-w-lg mx-auto aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl border-4 border-white/10 bg-[#0A1A14]">
      {/* Pitch Pattern Background */}
      <div className="absolute inset-0 pitch-pattern opacity-80" />
      
      {/* Pitch Lines */}
      <div className="absolute inset-4 border-2 border-white/30 rounded-sm pointer-events-none" />
      <div className="absolute top-1/2 left-4 right-4 border-t-2 border-white/30 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 border-2 border-white/30 rounded-full pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-white/50 rounded-full pointer-events-none" />
      
      {/* Penalty Boxes */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 w-48 h-24 border-2 border-white/30 border-t-0 pointer-events-none" />
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-48 h-24 border-2 border-white/30 border-b-0 pointer-events-none" />
      
      {/* Goal Areas */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 w-24 h-10 border-2 border-white/30 border-t-0 pointer-events-none" />
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-24 h-10 border-2 border-white/30 border-b-0 pointer-events-none" />
      
      {/* Players Grid Layer */}
      <div className="absolute inset-0 flex flex-col justify-between py-6 px-4 z-10">
        {/* ATT */}
        <div className="flex justify-evenly w-full px-4">
          {att.map(p => <PlayerCard key={p.id} player={p} />)}
        </div>
        
        {/* MID */}
        <div className="flex justify-evenly w-full">
          {mid.map(p => <PlayerCard key={p.id} player={p} />)}
        </div>
        
        {/* DEF */}
        <div className="flex justify-evenly w-full">
          {def.map(p => <PlayerCard key={p.id} player={p} />)}
        </div>
        
        {/* GOL & TEC */}
        <div className="flex justify-center w-full relative">
          {gk.map(p => <PlayerCard key={p.id} player={p} />)}
          
          <div className="absolute right-0 bottom-0 scale-90 opacity-80 hover:opacity-100 transition-opacity">
            {tec.map(p => <PlayerCard key={p.id} player={p} />)}
          </div>
        </div>
      </div>
    </div>
  );
};
