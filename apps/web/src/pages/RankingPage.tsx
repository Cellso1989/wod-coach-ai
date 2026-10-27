import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronDown, Medal, Search, Trophy, Users, Zap } from 'lucide-react';
import type { MonthlyRanking, RankedAthlete } from '@wod-coach-ai/types';
import { api } from '../lib/api.js';
import { createRankingDemo } from '../lib/ranking-demo.js';
import { NavBar } from '../components/NavBar.js';
import { BrandHomeLink } from '../components/BrandHomeLink.js';
import { Alert, Button, Card, TextInput } from '../components/ui.js';

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
function currentDay() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}
function dateLabel(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('pt-BR', {
    day: 'numeric',
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
              Resultados da semana ({athlete.weekResults.length})
            </span>
          </span>
          <span className="text-right">
            <span className="text-lg font-bold">{number.format(athlete.points ?? 0)}</span>
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
          <p className="text-xs font-semibold text-neutral-300">
            Resultados da semana · segunda a domingo
          </p>
          {athlete.weekResults.length ? (
            athlete.weekResults.map((performance) => (
              <div
                key={performance.id}
                className="flex items-start justify-between gap-3 rounded-lg bg-neutral-950 p-3 text-xs"
              >
                <div className="min-w-0">
                  <p className="break-words font-semibold text-neutral-200">
                    {new Date(`${performance.date}T12:00:00Z`).toLocaleDateString('pt-BR', {
                      weekday: 'short',
                      day: '2-digit',
                      month: '2-digit',
                      timeZone: 'America/Sao_Paulo',
                    })}
                  </p>
                  <p className="mt-1 text-neutral-400">
                    {performance.score}
                    {performance.position != null && ` · ${performance.position}º no dia`}
                  </p>
                </div>
                <span className="max-w-[45%] shrink-0 text-right font-semibold text-orange-400">
                  {performance.points != null
                    ? `${number.format(performance.points)} pts`
                    : performance.beforeScoringStart
                      ? 'Antes do início da pontuação'
                      : 'Não pontuou'}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-neutral-400">Nenhum resultado registrado nesta semana.</p>
          )}
        </div>
      </details>
    </li>
  );
}

export function RankingPage({ demo = false }: { demo?: boolean }) {
  const [today, setToday] = useState(currentDay);
  const [data, setData] = useState<MonthlyRanking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [onlyRanked, setOnlyRanked] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setToday(currentDay()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setData(null);
    if (import.meta.env.DEV && demo) {
      setData(createRankingDemo(today));
      setLoading(false);
      return () => controller.abort();
    }
    void api
      .getMonthlyRanking(today.slice(0, 7), controller.signal)
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
  }, [today, demo, attempt]);

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
                Acumulado do mês. Uma única pontuação por dia.
              </p>
              {data && (
                <p className="mt-1 text-xs text-orange-400">
                  Pontuação a partir de {dateLabel(data.scoringStartsOn)}.
                </p>
              )}
            </div>
            <p aria-label="Data da classificação" className="text-xs text-neutral-400">
              Hoje · {dateLabel(today)}
            </p>
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
                { label: 'Comparações no mês', value: data.summary.comparableWorkouts, icon: Zap },
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
                  {new Date(`${data.month}-15T12:00:00Z`).toLocaleDateString('pt-BR', {
                    month: 'long',
                    year: 'numeric',
                    timeZone: 'America/Sao_Paulo',
                  })}
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
                      <p className="mt-2 text-xs text-neutral-500">Acumulado do mês</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-7 text-center">
                  <Trophy className="mx-auto mb-3 text-neutral-600" size={30} aria-hidden="true" />
                  <p className="font-semibold">O próximo destaque pode ser você.</p>
                  <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500">
                    O ranking começa quando dois atletas registram resultados válidos do mesmo tipo
                    no mesmo dia deste mês. O treino realizado não interfere na comparação.
                  </p>
                </div>
              )}
            </section>

            <section aria-label="Classificação geral" className="space-y-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-lg font-bold">Classificação geral</h2>
                  <p className="mt-1 text-xs text-neutral-500">
                    Acumulado do mês · abra um atleta para ver os resultados da semana
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
                  O ranking usa somente o campo Resultado. Não conferimos o treino, movimentos,
                  cargas, prescrição, análise ou time cap. Resultados do mesmo tipo são comparados
                  no mesmo dia, mesmo que os atletas tenham feito treinos diferentes. É preciso ter
                  pelo menos dois atletas participantes com resultados válidos do mesmo tipo. Se
                  registrar tipos diferentes no dia, vale o tipo do último resultado válido. Dentro
                  desse tipo, conta somente seu melhor resultado do dia.
                </p>
                <p>
                  Tempos como 11:36 ou 12 min são comparados pelo menor tempo. CAP 10 significa que
                  faltaram 10 repetições e participa da mesma comparação dos tempos. Quem finalizou
                  fica acima de quem bateu o CAP. Entre os CAPs, menos repetições faltando significa
                  melhor posição e a mesma quantidade gera empate. Resultados em rounds são
                  comparados pelo maior número de rounds e, em caso de empate, pelas reps extras.
                  Resultados como 150 reps são comparados pelo maior total de reps, separadamente
                  dos rounds e dos tempos. Não convertemos rounds em reps.
                </p>
                <p>
                  A pontuação por colocação é fixa: 1º recebe 100 pontos, 2º recebe 75, 3º recebe 50
                  e 4º recebe 25. Do 5º lugar em diante, cada atleta recebe 10 pontos. Essa regra
                  vale independentemente da quantidade de participantes: com seis atletas, são 100,
                  75, 50, 25, 10 e 10 pontos. Empates na mesma colocação recebem os mesmos pontos.
                  Cada atleta recebe uma única pontuação por dia, de até 100 pontos. O total do mês
                  soma essas pontuações diárias e reinicia a cada mês. Por exemplo: 100 hoje, 75
                  amanhã e 50 depois totalizam 225 pontos. Resultados adicionais no mesmo dia não
                  somam pontos extras. Ao abrir um atleta, aparecem todos os resultados da semana,
                  de segunda a domingo, inclusive os que não pontuaram. CAP também pontua pela
                  colocação. Quando novos atletas enviam resultados válidos do mesmo tipo, as
                  posições e os pontos do dia são recalculados.
                </p>
                <p>
                  O dia considera a data do primeiro registro do resultado, no horário de São Paulo.
                  Editar um resultado recalcula a classificação. Os resultados são informados pelos
                  atletas.
                </p>
                <p>
                  A pontuação começou em {dateLabel(data.scoringStartsOn)}. Resultados anteriores
                  continuam no histórico, mas não somam pontos. O acumulado reinicia a cada mês.
                </p>
                <p>
                  Quem não tem outro atleta com resultado do mesmo tipo no dia aparece sem
                  classificação. Resultados não reconhecidos ficam fora do cálculo. Informe o tempo
                  como 11:36 ou 12 min, o CAP como CAP 10, ou o trabalho concluído como 8 rounds +
                  12 reps ou 150 reps. O tempo informado não é validado contra o time cap do treino.{' '}
                  {data.summary.uncomparedResults > 0
                    ? `${data.summary.uncomparedResults} de ${data.summary.recordedResults} registros ficaram fora do cálculo neste mês, incluindo tentativas repetidas, tipos substituídos e resultados sem outro participante do mesmo tipo no dia.`
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
