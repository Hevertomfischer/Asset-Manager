export function getPositionColor(pos: string) {
  switch (pos.toUpperCase()) {
    case "GOL": return "text-[#EAB308] bg-[#EAB308]/10 border-[#EAB308]/30";
    case "ZAG": return "text-[#3B82F6] bg-[#3B82F6]/10 border-[#3B82F6]/30";
    case "LAT": return "text-[#06B6D4] bg-[#06B6D4]/10 border-[#06B6D4]/30";
    case "MEI": return "text-[#A855F7] bg-[#A855F7]/10 border-[#A855F7]/30";
    case "ATA": return "text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/30";
    case "TEC": return "text-[#10B981] bg-[#10B981]/10 border-[#10B981]/30";
    default: return "text-gray-400 bg-gray-400/10 border-gray-400/30";
  }
}
