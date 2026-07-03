import { FC } from "react";
import { PlayerCard } from "@/components/PlayerCard";

interface PlayerOnPitch {
  id: number;
  name: string;
  nickname?: string | null;
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
  const rows = formation.split("-").map(Number);

  const getPlayersByPos = (positions: string[]) =>
    players.filter((p) => positions.includes(p.position));

  const gk  = getPlayersByPos(["GOL"]).slice(0, 1);
  const def = getPlayersByPos(["ZAG", "LAT"]).slice(0, rows[0] || 0);
  const mid = getPlayersByPos(["MEI"]).slice(0, rows[1] || 0);
  const att = getPlayersByPos(["ATA"]).slice(0, rows[2] || 0);
  const tec = getPlayersByPos(["TEC"]).slice(0, 1);

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
          {att.map((p) => (
            <PlayerCard key={p.id} variant="pitch" player={p} isCaptain={p.isCaptain} />
          ))}
        </div>

        {/* MID */}
        <div className="flex justify-evenly w-full">
          {mid.map((p) => (
            <PlayerCard key={p.id} variant="pitch" player={p} isCaptain={p.isCaptain} />
          ))}
        </div>

        {/* DEF */}
        <div className="flex justify-evenly w-full">
          {def.map((p) => (
            <PlayerCard key={p.id} variant="pitch" player={p} isCaptain={p.isCaptain} />
          ))}
        </div>

        {/* GOL & TEC */}
        <div className="flex justify-center w-full relative">
          {gk.map((p) => (
            <PlayerCard key={p.id} variant="pitch" player={p} isCaptain={p.isCaptain} />
          ))}

          <div className="absolute right-0 bottom-0 scale-90 opacity-80 hover:opacity-100 transition-opacity">
            {tec.map((p) => (
              <PlayerCard key={p.id} variant="pitch" player={p} isCaptain={p.isCaptain} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
