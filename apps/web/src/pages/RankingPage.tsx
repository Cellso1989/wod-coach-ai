import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronDown, Medal, Search, Trophy, Users, Zap } from 'lucide-react';
import type { MonthlyRanking, RankedAthlete } from '@wod-coach-ai/types';
import { api } from '../lib/api.js';
import { createRankingDemo } from '../lib/ranking-demo.js';
import { NavBar } from '../components/NavBar.js';
import { BrandHomeLink } from '../components/BrandHomeLink.js';
import { Alert, Button, Card, TextInput } from '../components/ui.js';

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
function currentMonth() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
}
function monthLabel(month: string) {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  });
}
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}

function AthleteRow({ athlete }: { athlete: RankedAthlete }) {
  return (
    <li
      className={`rounded-xl border ${athlete.isCurrentUser ? 'border-orange-700/60 bg-orange-950/20' : 'border-neutral-800 bg-neutral-900/50'}`}
    >
      <details className="group">
        <summary className="grid cursor-pointer list-none grid-cols-[2rem_minmax(0,1fr)_4.5rem_1rem] items-center gap-2 p-4 sm:grid-cols-[3rem_minmax(0,1fr)_6rem_1rem] [&::-webkit-details-marker]:hidden">
          <span
            className={`text-lg font-bold ${athlete.position === 1 ? 'text-orange-400' : 'text-neutral-500'}`}
          >
            {athlete.position ? `${athlete.position}º` : '—'}
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              <span className="break-words">{athlete.name}</span>
              {athlete.isCurrentUser && (
                <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-orange-400">
                  Você
                </span>
              )}
            </span>
            <span className="mt-1 block text-xs text-neutral-500">
              {athlete.comparedWorkouts
                ? `${athlete.comparedWorkouts} ${athlete.comparedWorkouts === 1 ? 'Wod' : "Wod's"}`
                : 'Sem classificação'}
            </span>
          </span>
          <span className="text-right">
            <span className="text-lg font-bold">
              {athlete.points == null ? '—' : number.format(athlete.points)}
            </span>
            <span className="block text-[10px] uppercase tracking-wide text-neutral-500">
              pontos
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            size={16}
            className="text-neutral-500 transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="space-y-2 border-t border-neutral-800 p-4">
          {athlete.performances.length ? (
            athlete.performances.map((performance, index) => (
              <div
                key={index}
                className="flex items-start justify-between gap-3 rounded-lg bg-neutral-950 p-3 text-xs"
              >
                <div className="min-w-0">
                  <p className="break-words font-semibold text-neutral-200">
                    {performance.workout}
                  </p>
                  <p className="mt-1 text-neutral-400">
                    {performance.score} ·{' '}
                    {performance.status === 'cap'
                      ? `Faltaram ${performance.remainingReps} reps · ${performance.position}º de ${performance.athletes} atletas`
                      : `${performance.position}º de ${performance.athletes} atletas`}
                  </p>
                </div>
                <span className="shrink-0 font-semibold text-orange-400">
                  {number.format(performance.points)} pts
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-neutral-400">
              Ainda não há resultados comparáveis deste atleta no mês.
            </p>
          )}
        </div>
      </details>
    </li>
  );
}

export function RankingPage({ demo = false }: { demo?: boolean }) {
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<MonthlyRanking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [onlyRanked, setOnlyRanked] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setData(null);
    if (import.meta.env.DEV && demo) {
      setData(createRankingDemo(month, currentMonth()));
      setLoading(false);
      return () => controller.abort();
    }
    void api
      .getMonthlyRanking(month, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setData(response);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted)
          setError(err instanceof Error ? err.message : 'Não foi possível carregar o ranking.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [month, demo, attempt]);

  const leaders =
    data?.athletes.filter((athlete) => athlete.points != null && athlete.points > 0).slice(0, 3) ??
    [];
  const own = data?.athletes.find((athlete) => athlete.isCurrentUser);
  const filtered =
    data?.athletes.filter(
      (athlete) =>
        (!onlyRanked || athlete.position != null) &&
        athlete.name.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')),
    ) ?? [];

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-neutral-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
              WOD Coach AI
            </p>
            <BrandHomeLink />
          </div>
          <NavBar />
          {import.meta.env.DEV && demo && (
            <p className="rounded-lg border border-sky-900 bg-sky-950/30 px-3 py-2 text-xs text-sky-300">
              Prévia local · atletas e resultados fictícios
            </p>
          )}
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Ranking</h1>
              <p className="mt-2 text-sm text-neutral-400">
                Cada treino conta, o desempenho define a posição.
              </p>
            </div>
            <label className="block min-w-0 text-xs text-neutral-400">
              <span className="mb-2 block">Mês da classificação</span>
              <TextInput
                aria-label="Mês da classificação"
                className="block min-w-0 max-w-full appearance-none [&::-webkit-date-and-time-value]:min-w-0"
                type="month"
                min="2020-01"
                max={currentMonth()}
                value={month}
                onChange={(event) => {
                  if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(event.target.value))
                    setMonth(event.target.value);
                }}
              />
            </label>
          </div>
        </header>

        {loading && (
          <p
            role="status"
            className="rounded-xl border border-neutral-800 p-8 text-center text-neutral-400"
          >
            Carregando classificação...
          </p>
        )}
        {error && (
          <div className="space-y-3">
            <Alert>{error}</Alert>
            <Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>
              Tentar novamente
            </Button>
          </div>
        )}

        {data && (
          <>
            {!own && (
              <Card className="space-y-2 border-orange-900/50">
                <p className="text-sm font-semibold">
                  Você ainda não está participando do Ranking.
                </p>
                <p className="text-xs text-neutral-400">
                  Ative a opção no seu perfil e salve para entrar na classificação.
                </p>
                <Link to="/profile" className="inline-block text-sm font-semibold text-orange-400">
                  Ir para meu perfil
                </Link>
              </Card>
            )}
            <section aria-label="Resumo do mês" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: 'Atletas participantes', value: data.summary.users, icon: Users },
                { label: 'Atletas classificados', value: data.summary.rankedAthletes, icon: Medal },
                { label: "Wod's comparáveis", value: data.summary.comparableWorkouts, icon: Zap },
                {
                  label: 'Sua posição',
                  value: own?.position ? `${own.position}º` : '—',
                  icon: ArrowUpRight,
                },
              ].map(({ label, value, icon: Icon }) => (
                <Card key={label} className="space-y-3">
                  <Icon size={17} aria-hidden="true" className="text-orange-400" />
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs text-neutral-500">{label}</p>
                </Card>
              ))}
            </section>

            <section
              aria-label="Destaques do mês"
              className="overflow-hidden rounded-2xl border border-orange-900/50 bg-gradient-to-br from-orange-950/30 via-neutral-900 to-neutral-950 p-5 sm:p-6"
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">Destaques do mês</h2>
                <span className="text-xs capitalize text-neutral-500">
                  {monthLabel(data.month)}
                </span>
              </div>
              {leaders.length ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  {leaders.map((athlete, index) => (
                    <div
                      key={athlete.userId}
                      className={`relative min-w-0 rounded-xl border p-5 ${index === 0 ? 'border-orange-600/50 bg-orange-600/10' : 'border-neutral-700/60 bg-neutral-950/40'}`}
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <span
                          className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold ${index === 0 ? 'bg-orange-500 text-neutral-950' : 'bg-neutral-800 text-neutral-200'}`}
                        >
                          {initials(athlete.name)}
                        </span>
                        <span className={index === 0 ? 'text-orange-400' : 'text-neutral-500'}>
                          <Trophy size={index === 0 ? 24 : 18} aria-hidden="true" />
                        </span>
                      </div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                        {athlete.position}º lugar
                      </p>
                      <p className="mt-1 break-words font-bold">
                        {athlete.name}
                        {athlete.isCurrentUser ? ' · Você' : ''}
                      </p>
                      <p className="mt-3 text-3xl font-extrabold">
                        {number.format(athlete.points!)}
                        <span className="ml-1 text-xs font-normal text-neutral-500">pts</span>
                      </p>
                      <p className="mt-2 text-xs text-neutral-500">
                        Total em {athlete.comparedWorkouts}{' '}
                        {athlete.comparedWorkouts === 1 ? 'Wod' : "Wod's"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-7 text-center">
                  <Trophy className="mx-auto mb-3 text-neutral-600" size={30} aria-hidden="true" />
                  <p className="font-semibold">O próximo destaque pode ser você.</p>
                  <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500">
                    O ranking começa quando dois atletas registram resultados válidos para o mesmo
                    WOD e prescrição no mês.
                  </p>
                </div>
              )}
            </section>

            <section aria-label="Classificação geral" className="space-y-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-lg font-bold">Classificação geral</h2>
                  <p className="mt-1 text-xs text-neutral-500">
                    Pontos acumulados no mês · abra um atleta para ver os resultados
                  </p>
                </div>
                <label className="relative sm:w-64">
                  <span className="sr-only">Buscar atleta</span>
                  <Search
                    size={16}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-3.5 text-neutral-500"
                  />
                  <TextInput
                    className="pl-9"
                    placeholder="Buscar atleta"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={onlyRanked ? 'secondary' : 'primary'}
                  className="min-h-8 px-3 py-1 text-xs"
                  aria-pressed={!onlyRanked}
                  onClick={() => setOnlyRanked(false)}
                >
                  Todos os atletas
                </Button>
                <Button
                  type="button"
                  variant={onlyRanked ? 'primary' : 'secondary'}
                  className="min-h-8 px-3 py-1 text-xs"
                  aria-pressed={onlyRanked}
                  onClick={() => setOnlyRanked(true)}
                >
                  Classificados
                </Button>
              </div>
              <ol aria-label="Classificação mensal" className="space-y-2">
                {filtered.map((athlete) => (
                  <AthleteRow key={athlete.userId} athlete={athlete} />
                ))}
              </ol>
              {!filtered.length && (
                <p className="rounded-xl border border-dashed border-neutral-800 p-6 text-center text-sm text-neutral-500">
                  {search
                    ? 'Nenhum atleta encontrado para essa busca.'
                    : 'Nenhum atleta classificado neste mês.'}
                </p>
              )}
            </section>

            <details className="rounded-xl border border-neutral-800 p-4 text-sm text-neutral-400">
              <summary className="cursor-pointer font-semibold text-neutral-200">
                Como o ranking é calculado
              </summary>
              <div className="mt-4 space-y-3 leading-relaxed">
                <p>
                  Comparamos o mesmo treino e a mesma prescrição registrada: formato, movimentos,
                  ordem, rounds, repetições, cargas, distâncias, calorias e tempo. O título, o texto
                  original e as observações pessoais não definem o Wod: vale a prescrição salva na
                  análise. Adaptações precisam estar refletidas nessa prescrição. Cada Wod reúne
                  todos os atletas participantes do ranking que enviaram um resultado válido para a
                  mesma prescrição no mês, sem limite de participantes. É preciso ter pelo menos
                  dois atletas para haver comparação. Vale apenas o melhor resultado de cada atleta
                  por WOD no mês.
                </p>
                <p>
                  Nos WODs por tempo, vence o menor tempo. Nos AMRAPs de repetições, vence o maior
                  total de reps. Nos WODs por tempo, CAP 10 significa que faltaram 10 repetições.
                  Quem finalizou fica acima de quem bateu o CAP. Entre os CAPs, menos repetições
                  faltando significa melhor posição e a mesma quantidade gera empate.
                </p>
                <p>
                  O vencedor recebe 100 pontos. Cada posição seguinte reduz 100 dividido pelo número
                  de atletas do Wod: com quatro atletas, são 100, 75, 50 e 25 pontos. Empates
                  recebem os mesmos pontos. A soma dos pontos dos Wod's forma a classificação
                  mensal: participar de mais Wod's comparáveis permite acumular mais pontos. WODs
                  sem participação não somam pontos; repetir o mesmo WOD não gera pontos extras. CAP
                  também pontua pela colocação. Quando novos atletas enviam resultados válidos para
                  o mesmo WOD, as posições e os pontos desse Wod são recalculados.
                </p>
                <p>
                  O mês considera a data do primeiro registro do resultado, no horário de São Paulo.
                  Editar um resultado recalcula a classificação. Os resultados são informados pelos
                  atletas.
                </p>
                <p>
                  Quem não tem Wod comparável aparece sem classificação. WODs sem prescrição
                  suficiente, formatos ainda não suportados e resultados não reconhecidos ficam fora
                  do cálculo. Um tempo acima do limite ou CAP sem quantidade precisa ser informado
                  como CAP e repetições faltantes para entrar no ranking. Em AMRAP, registre as reps
                  ou rounds completados.{' '}
                  {data.summary.uncomparedResults > 0
                    ? `${data.summary.uncomparedResults} de ${data.summary.recordedResults} registros ficaram fora do cálculo neste mês, incluindo tentativas repetidas.`
                    : ''}
                </p>
              </div>
            </details>
          </>
        )}
      </div>
    </main>
  );
}
