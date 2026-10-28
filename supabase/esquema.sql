-- La base de datos de las partidas de todos los jugadores (3.69.0).
--
-- Se pega ENTERO en Supabase → SQL Editor → Run. Se puede volver a pegar
-- cuando cambie: todo es «si no existe» o «crear o reemplazar».
--
-- Cómo va:
-- - Cada jugador tiene una CLAVE al azar que genera la app (sin correo ni
--   contraseña). Aquí no se guarda la clave: solo su huella (SHA-256), así que
--   quien leyera la base de datos no podría escribir en nombre de nadie.
-- - Las tablas están cerradas: con la clave pública de la app (la que va en
--   `public/comunidad.json`) no se pueden leer ni escribir. Solo se entra por
--   las cuatro funciones de abajo, que comprueban todo lo que llega.
-- - Lo que se publica para medir (`partidas_comunidad`) va con un número de
--   jugador, nunca con la huella ni la clave.
-- - Topes: 200 partidas por envío, 5.000 por jugador, 200.000 en total, 20.000
--   jugadores y 2 KB por partida, para que nadie llene el proyecto gratuito
--   (500 MB). Los totales solo frenan lo NUEVO: quien ya está puede seguir
--   corrigiendo y borrando lo suyo aunque alguien llene el resto.
-- - De cada partida se guardan solo los campos que usa la app para medir;
--   lo demás que llegue se tira.

create table if not exists public.jugadores (
  id bigint generated always as identity primary key,
  huella text not null unique,
  referencia jsonb,
  creado timestamptz not null default now(),
  visto timestamptz not null default now()
);

create table if not exists public.partidas (
  jugador bigint not null references public.jugadores(id) on delete cascade,
  t bigint not null,
  datos jsonb not null,
  recibida timestamptz not null default now(),
  primary key (jugador, t)
);

alter table public.jugadores enable row level security;
alter table public.partidas enable row level security;
-- Sin políticas: con RLS y sin ninguna, nadie de fuera ve una fila.
revoke all on public.jugadores, public.partidas from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.jugadores, public.partidas from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.jugadores, public.partidas from authenticated';
  end if;
end $$;

-- La huella de una clave válida, o un error «clave».
create or replace function public.huella_de(clave text) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
begin
  if clave is null or clave !~ '^[A-Za-z0-9_-]{32,64}$' then
    raise exception 'clave' using errcode = 'P0001';
  end if;
  return encode(sha256(convert_to(clave, 'UTF8')), 'hex');
end $$;

-- Guarda (o reemplaza, por su instante `t`) un lote de partidas, quita las
-- que el jugador borró en su móvil y apunta su winrate de siempre.
create or replace function public.subir_partidas(clave text, lote jsonb, quitar jsonb default '[]'::jsonb, referencia jsonb default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  h text := public.huella_de(clave);
  yo bigint;
  p jsonb;
  n_guardadas int := 0;
  n_quitadas int := 0;
  ahora_ms bigint := (extract(epoch from now()) * 1000)::bigint;
  ref jsonb := null;
begin
  if jsonb_typeof(lote) is distinct from 'array' or jsonb_array_length(lote) > 200 then
    raise exception 'lote' using errcode = 'P0001';
  end if;
  if quitar is null then quitar := '[]'::jsonb; end if;
  if jsonb_typeof(quitar) is distinct from 'array' or jsonb_array_length(quitar) > 1000
     or exists (select 1 from jsonb_array_elements(quitar) q where jsonb_typeof(q) is distinct from 'number' or (q::text)::numeric <> floor((q::text)::numeric)) then
    raise exception 'quitar' using errcode = 'P0001';
  end if;
  -- El winrate de siempre (de la maestría): solo dos números con sentido.
  if jsonb_typeof(referencia) = 'object'
     and jsonb_typeof(referencia->'winRate') = 'number' and jsonb_typeof(referencia->'partidas') = 'number'
     -- Un winrate de siempre fuera de 30–70% con cientos de partidas no existe en MLBB: no se guarda.
     and (referencia->>'winRate')::numeric between 0.3 and 0.7
     and (referencia->>'partidas')::numeric between 1 and 1000000 then
    ref := jsonb_build_object('winRate', round((referencia->>'winRate')::numeric, 4), 'partidas', floor((referencia->>'partidas')::numeric));
  end if;

  for p in select * from jsonb_array_elements(lote) loop
    if jsonb_typeof(p) is distinct from 'object'
       or jsonb_typeof(p->'t') is distinct from 'number'
       or (p->>'t')::numeric <> floor((p->>'t')::numeric)
       or (p->>'t')::numeric < 1577836800000 or (p->>'t')::numeric > ahora_ms + 86400000
       or jsonb_typeof(p->'gane') is distinct from 'boolean'
       or jsonb_typeof(p->'pick') is distinct from 'string' or coalesce(length(p->>'pick'), 0) not between 1 and 40
       or pg_column_size(p) > 2000 then
      -- «is distinct from»: con un campo que falta, «<>» da NULL y no rechazaba.
      raise exception 'partida' using errcode = 'P0001';
    end if;
  end loop;

  select id into yo from public.jugadores where huella = h;
  if yo is null then
    if (select count(*) from public.jugadores) >= 20000 then
      raise exception 'lleno' using errcode = 'P0001';
    end if;
    insert into public.jugadores (huella, referencia) values (h, ref)
    on conflict (huella) do update set visto = now()
    returning id into yo;
  else
    update public.jugadores j set visto = now(), referencia = coalesce(ref, j.referencia) where j.id = yo;
  end if;

  with q as (select (x)::text::numeric::bigint as t from jsonb_array_elements(quitar) x)
  delete from public.partidas where jugador = yo and t in (select t from q);
  get diagnostics n_quitadas = row_count;

  -- El tope total solo frena las partidas NUEVAS: corregir las tuyas siempre se puede.
  if exists (
    select 1 from jsonb_array_elements(lote) x
    where not exists (select 1 from public.partidas q where q.jugador = yo and q.t = (x->>'t')::numeric::bigint)
  ) and (select count(*) from public.partidas) >= 200000 then
    raise exception 'lleno' using errcode = 'P0001';
  end if;

  insert into public.partidas (jugador, t, datos)
  -- Un instante repetido en el lote: vale la última copia (dos en el mismo
  -- mandato harían fallar el «on conflict»). Solo los campos conocidos.
  select distinct on ((e.x->>'t')::numeric::bigint) yo, (e.x->>'t')::numeric::bigint,
    jsonb_strip_nulls(jsonb_build_object(
      't', (e.x->>'t')::numeric::bigint, 'pick', e.x->'pick', 'gane', e.x->'gane', 'recomendados', e.x->'recomendados',
      'rango', e.x->'rango', 'estimacion', e.x->'estimacion', 'modelo', e.x->'modelo', 'previa', e.x->'previa',
      'origen', e.x->'origen', 'bans', e.x->'bans', 'draft', e.x->'draft', 'duracion', e.x->'duracion', 'fases', e.x->'fases',
      -- Cuándo la arreglaste (3.76.0): al juntar móvil y tablet gana la copia arreglada más tarde.
      'editada', case when jsonb_typeof(e.x->'editada') = 'number' then e.x->'editada' end,
      -- El pick es el nº1 porque no se leyó el tuyo (3.81.2): no cuenta como «siguió el consejo».
      'supuesto', case when e.x->'supuesto' = 'true'::jsonb then e.x->'supuesto' end))
  from jsonb_array_elements(lote) with ordinality as e(x, orden)
  order by (e.x->>'t')::numeric::bigint, e.orden desc
  -- Una copia arreglada más tarde no la pisa otra más vieja (3.76.0): el móvil
  -- vuelve a subir sus partidas a menudo, y sin esto deshacía lo arreglado en la tablet.
  on conflict (jugador, t) do update set datos = excluded.datos, recibida = now()
    where coalesce((excluded.datos->>'editada')::numeric, 0) >= coalesce((public.partidas.datos->>'editada')::numeric, 0);
  get diagnostics n_guardadas = row_count;

  if (select count(*) from public.partidas where jugador = yo) > 5000 then
    raise exception 'tope' using errcode = 'P0001';
  end if;
  return jsonb_build_object('guardadas', n_guardadas, 'quitadas', n_quitadas,
    'total', (select count(*) from public.partidas where jugador = yo));
end $$;

-- Las partidas de quien tiene la clave (para traerlas a otro móvil).
create or replace function public.mis_partidas(clave text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare h text := public.huella_de(clave);
begin
  return jsonb_build_object(
    'partidas', coalesce((select jsonb_agg(p.datos order by p.t desc) from public.partidas p join public.jugadores j on j.id = p.jugador where j.huella = h), '[]'::jsonb),
    'referencia', (select referencia from public.jugadores where huella = h));
end $$;

-- Borra al jugador y todas sus partidas. Devuelve si había algo.
create or replace function public.borrar_mis_partidas(clave text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare h text := public.huella_de(clave); n int;
begin
  delete from public.jugadores where huella = h;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Las partidas de todos, para medir si la app ayuda: el jugador va como un
-- número, sin huella. Por páginas (de 1.000 como mucho), en orden de jugador
-- y de instante: la siguiente página empieza tras el último (j, t) recibido.
create or replace function public.partidas_comunidad(tras_jugador bigint default 0, tras_t bigint default 0, cuantas int default 1000) returns jsonb
language plpgsql security definer stable set search_path = public, pg_temp as $$
declare lim int := least(greatest(coalesce(cuantas, 1000), 1), 1000);
begin
  return (
    with pagina as (
      select p.jugador, p.t, p.datos from public.partidas p
      where (p.jugador, p.t) > (coalesce(tras_jugador, 0), coalesce(tras_t, 0))
      order by p.jugador, p.t limit lim
    )
    select jsonb_build_object(
      'filas', coalesce((select jsonb_agg(jsonb_build_object('j', jugador, 't', t, 'd', datos) order by jugador, t) from pagina), '[]'::jsonb),
      'referencias', coalesce((select jsonb_object_agg(j.id::text, j.referencia) from public.jugadores j where j.id in (select jugador from pagina) and j.referencia is not null), '{}'::jsonb),
      'mas', (select count(*) from pagina) = lim)
  );
end $$;

-- Los PARTES de salud del lector de la tablet (3.74.0): cada 15 minutos,
-- cómo va (versión, si graba, lecturas, fallos, edad de los datos, partidas
-- sin subir) y las últimas líneas de su registro, sin IP ni códigos. Para
-- que una revisión automática vea si algo falla sin que nadie copie nada.
-- Topes: 16 KB por parte, uno cada 4 minutos por jugador, los 100 últimos
-- de cada uno y 7 días; lo de más se borra al subir.
create table if not exists public.partes (
  id bigint generated always as identity primary key,
  jugador bigint not null references public.jugadores(id) on delete cascade,
  recibido timestamptz not null default now(),
  datos jsonb not null
);
create index if not exists partes_por_jugador on public.partes (jugador, recibido desc);
alter table public.partes enable row level security;
revoke all on public.partes from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on public.partes from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on public.partes from authenticated'; end if;
end $$;

create or replace function public.subir_parte(clave text, parte jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  h text := public.huella_de(clave);
  yo bigint;
begin
  if jsonb_typeof(parte) is distinct from 'object' or pg_column_size(parte) > 16000 then
    raise exception 'parte' using errcode = 'P0001';
  end if;
  select id into yo from public.jugadores where huella = h;
  if yo is null then
    if (select count(*) from public.jugadores) >= 20000 then raise exception 'lleno' using errcode = 'P0001'; end if;
    insert into public.jugadores (huella) values (h) on conflict (huella) do update set visto = now() returning id into yo;
  end if;
  if exists (select 1 from public.partes where jugador = yo and recibido > now() - interval '4 minutes') then
    raise exception 'pronto' using errcode = 'P0001';
  end if;
  insert into public.partes (jugador, datos) values (yo, parte);
  delete from public.partes where jugador = yo and (recibido < now() - interval '7 days'
    or id not in (select id from public.partes where jugador = yo order by recibido desc limit 100));
  return jsonb_build_object('ok', true);
end $$;

-- Los partes de los últimos días, para la revisión automática: el jugador va
-- como un número (el de `partidas_comunidad`), nunca con la huella.
create or replace function public.partes_recientes(horas int default 48) returns jsonb
language plpgsql security definer stable set search_path = public, pg_temp as $$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('j', p.jugador, 'recibido', p.recibido, 'd', p.datos) order by p.recibido desc)
    from (select * from public.partes where recibido > now() - make_interval(hours => least(greatest(coalesce(horas, 48), 1), 168)) order by recibido desc limit 2000) p
  ), '[]'::jsonb);
end $$;

-- Los recortes del draft (3.81.0): cuando la tablet sola apunta una partida
-- con héroes sin reconocer, sube las dos capturas del draft que más leían,
-- reducidas a las DIEZ CARAS (sin los nombres de los jugadores) y lo leído
-- hueco a hueco, con el instante de la partida (`partida`) para cruzarlo con
-- el draft bueno (lo que dijiste en «Enseña al lector» o arreglaste después).
-- Es lo que mide el lector; antes llegaba como incidencias de GitHub desde el
-- móvil. Topes: 120 KB por recorte, uno por minuto por lector, los 300
-- últimos de cada uno y 60 días.
create table if not exists public.recortes (
  id bigint generated always as identity primary key,
  jugador bigint not null references public.jugadores(id) on delete cascade,
  recibido timestamptz not null default now(),
  datos jsonb not null
);
create index if not exists recortes_por_jugador on public.recortes (jugador, recibido desc);
alter table public.recortes enable row level security;
revoke all on public.recortes from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on public.recortes from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on public.recortes from authenticated'; end if;
end $$;

create or replace function public.subir_recorte(clave text, recorte jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  h text := public.huella_de(clave);
  yo bigint;
begin
  if jsonb_typeof(recorte) is distinct from 'object' or jsonb_typeof(recorte->'capturas') is distinct from 'array'
     or jsonb_array_length(recorte->'capturas') not between 1 and 2 or octet_length(recorte::text) > 120000 then
    raise exception 'recorte' using errcode = 'P0001';
  end if;
  select id into yo from public.jugadores where huella = h;
  if yo is null then
    if (select count(*) from public.jugadores) >= 20000 then raise exception 'lleno' using errcode = 'P0001'; end if;
    insert into public.jugadores (huella) values (h) on conflict (huella) do update set visto = now() returning id into yo;
  end if;
  if exists (select 1 from public.recortes where jugador = yo and recibido > now() - interval '1 minute') then
    raise exception 'pronto' using errcode = 'P0001';
  end if;
  insert into public.recortes (jugador, datos) values (yo, recorte);
  delete from public.recortes where jugador = yo and (recibido < now() - interval '60 days'
    or id not in (select id from public.recortes where jugador = yo order by recibido desc limit 300));
  return jsonb_build_object('ok', true);
end $$;

-- Los recortes de los últimos días, para medir el lector: el jugador va como
-- un número, nunca con la huella; como mucho 50 (cada uno pesa).
create or replace function public.recortes_recientes(horas int default 168) returns jsonb
language plpgsql security definer stable set search_path = public, pg_temp as $$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('j', r.jugador, 'recibido', r.recibido, 'd', r.datos) order by r.recibido desc)
    from (select * from public.recortes where recibido > now() - make_interval(hours => least(greatest(coalesce(horas, 168), 1), 1440)) order by recibido desc limit 50) r
  ), '[]'::jsonb);
end $$;

-- Los recortes de UN lector (3.83.0), por su clave: la tablet aprende solo de
-- los suyos. Con `recortes_recientes` (de todos) cualquiera podía subir un
-- recorte con el instante de una partida de Javi y enseñarle una cara falsa.
create or replace function public.mis_recortes(clave text, horas int default 720) returns jsonb
language plpgsql security definer stable set search_path = public, pg_temp as $$
declare
  yo bigint := (select id from public.jugadores where huella = public.huella_de(clave));
begin
  if yo is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('recibido', r.recibido, 'd', r.datos) order by r.recibido desc)
    from (select * from public.recortes where jugador = yo and recibido > now() - make_interval(hours => least(greatest(coalesce(horas, 720), 1), 1440)) order by recibido desc limit 50) r
  ), '[]'::jsonb);
end $$;

revoke all on function public.huella_de(text) from public;
revoke all on function public.subir_parte(text, jsonb) from public;
revoke all on function public.partes_recientes(int) from public;
revoke all on function public.subir_recorte(text, jsonb) from public;
revoke all on function public.recortes_recientes(int) from public;
revoke all on function public.mis_recortes(text, int) from public;
revoke all on function public.subir_partidas(text, jsonb, jsonb, jsonb) from public;
revoke all on function public.mis_partidas(text) from public;
revoke all on function public.borrar_mis_partidas(text) from public;
revoke all on function public.partidas_comunidad(bigint, bigint, int) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function public.huella_de(text) from %I', r);
      execute format('grant execute on function public.subir_partidas(text, jsonb, jsonb, jsonb) to %I', r);
      execute format('grant execute on function public.mis_partidas(text) to %I', r);
      execute format('grant execute on function public.borrar_mis_partidas(text) to %I', r);
      execute format('grant execute on function public.partidas_comunidad(bigint, bigint, int) to %I', r);
      execute format('grant execute on function public.subir_parte(text, jsonb) to %I', r);
      execute format('grant execute on function public.partes_recientes(int) to %I', r);
      execute format('grant execute on function public.subir_recorte(text, jsonb) to %I', r);
      execute format('grant execute on function public.recortes_recientes(int) to %I', r);
      execute format('grant execute on function public.mis_recortes(text, int) to %I', r);
    end if;
  end loop;
end $$;
