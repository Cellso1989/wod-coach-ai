export function defaultWorkoutName(date = new Date()): string {
  const weekday = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
  return `Treino de ${weekday}`;
}
