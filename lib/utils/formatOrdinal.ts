/** English ordinal for a 1-based rank: 1 → `1st`, 2 → `2nd`, 11 → `11th`, 21 → `21st`. */
export function formatEnglishOrdinal(rank: number): string {
  const n = Math.floor(rank)
  if (n < 1) return String(rank)
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}
