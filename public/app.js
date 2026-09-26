const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const state = {catalog: [], saved: {revision: 0, journeys: []}, pending: [], report: null, busy: false, expired: false};
const statuses = {
  no_reported_closure: 'No reported closure', alternate_entrance: 'Another entrance to review',
  blocked: 'Closure affects this path', unknown: 'Could not verify this path',
};

let rpcId = 0, connection;
const mcpHeaders = {'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'};
async function rpc(method, params) {
  const response = await fetch('/mcp', {method:'POST',headers:mcpHeaders,body:JSON.stringify({jsonrpc:'2.0',id:++rpcId,method,params}),signal:AbortSignal.timeout(30_000)});
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(body.error?.message ?? 'The MCP connection could not complete.');
  return body.result;
}
async function tool(name, input = {}) {
  connection ??= (async () => {
    const init = await rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'liftcheck-web',version:'0.1.0'}});
    if (init.protocolVersion !== '2025-11-25') throw new Error('The required MCP protocol could not be negotiated.');
    const notification = await fetch('/mcp',{method:'POST',headers:mcpHeaders,body:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'}),signal:AbortSignal.timeout(10_000)});
    if (!notification.ok) throw new Error('MCP initialization did not complete.');
  })().catch(error => {connection = undefined; throw error;});
  await connection;
  const result = await rpc('tools/call',{name,arguments:input});
  if (result.isError) throw new Error(result.content?.find(item => item.type === 'text')?.text ?? 'The check could not complete.');
  return result.structuredContent;
}
function showError(message) {$('#error').textContent = message; $('#error').hidden = !message;}
function busy(value) {
  state.busy = value;
  document.querySelectorAll('button').forEach(button => {button.disabled = value || (button.id === 'export' && !state.report);});
  $('#results').setAttribute('aria-busy', String(value));
  $('#check-live').firstChild.textContent = value ? 'Checking… ' : 'Check current reports ';
}
async function action(fn) {
  if (state.busy) return;
  busy(true); showError('');
  try {await fn();}
  catch (error) {showError(error.name === 'TimeoutError' ? 'This request took too long. Try again; no new check was recorded.' : error.message);}
  finally {busy(false);}
}
function station() {return state.catalog.find(row => row.id === $('#station').value);}
function selectedLeg() {
  const reverse = $('input[name="direction"]:checked').value === 'exiting';
  return {stationId: $('#station').value, fromId: $(reverse ? '#platform' : '#entrance').value, toId: $(reverse ? '#entrance' : '#platform').value};
}
function populateEndpoints() {
  const current = station();
  for (const [selector, values] of [['#entrance', current.entrances], ['#platform', current.platforms]]) {
    $(selector).innerHTML = values.map(row => `<option value="${escape(row.id)}">${escape(selector === '#platform' ? row.name.replace(`${current.name} - `, '') : row.name)}</option>`).join('');
  }
  if (current.id === 'place-astao') {$('#entrance').value = 'door-astao-foley'; $('#platform').value = '70278';}
}
function describeLeg(leg) {
  const current = state.catalog.find(row => row.id === leg.stationId);
  const endpoints = [...current.entrances,...current.platforms];
  return `${current.name}: ${endpoints.find(row => row.id === leg.fromId)?.name ?? leg.fromId} → ${endpoints.find(row => row.id === leg.toId)?.name ?? leg.toId}`;
}
function renderPending() {
  $('#save-form').hidden = state.pending.length === 0;
  $('#pending-legs').innerHTML = state.pending.map(leg => `<li>${escape(describeLeg(leg))}</li>`).join('');
}
function renderSaved() {
  $('#saved-list').innerHTML = state.saved.journeys.length ? state.saved.journeys.map(journey => `<div class="saved-item"><button type="button" data-journey="${escape(journey.id)}"><span>${escape(journey.name)}<small>${journey.legs.length} station check${journey.legs.length === 1 ? '' : 's'}</small></span><span class="arrow" aria-hidden="true">↗</span></button></div>`).join('') : '<p class="muted">Save the station checks you repeat. Each journey can include up to four boarding or exit paths.</p>';
  document.querySelectorAll('[data-journey]').forEach(button => button.addEventListener('click', () => action(async () => renderReport(await tool('check_journey', {journeyId: button.dataset.journey})))));
}
function safeUrl(value) {
  try {const url = new URL(value); return ['https:','http:'].includes(url.protocol) ? url.href : null;}
  catch {return null;}
}
function sourceLink(url, label) {
  const href = safeUrl(url);
  return href ? `<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${escape(label)} ↗</a>` : '';
}
function time(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.valueOf()) ? new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(date) : 'Unavailable';
}
function pathCard(path, title, alternative = false) {
  if (!path) return '';
  const first = path.nodes[0], last = path.nodes.at(-1);
  const mid = path.facilities.length ? path.facilities.map(facility => `<span class="chain-arrow" aria-hidden="true">→</span><span class="chain-node elevator" title="${escape(facility.name)}">↕ Elevator ${escape(facility.id)}</span>`).join('') : '<span class="chain-arrow" aria-hidden="true">→</span><span class="chain-node">Mapped walkways</span>';
  return `<div class="path-box ${alternative ? 'alternative' : ''}"><h3>${escape(title)}</h3><div class="path-chain"><span class="chain-node">${escape(first?.name ?? path.fromId)}</span>${mid}<span class="chain-arrow" aria-hidden="true">→</span><span class="chain-node">${escape(last?.name ?? path.toId)}</span></div><p class="path-note">${escape(path.metric)} · ${path.edgeCount} connections${Number.isFinite(path.lengthM) ? ` · ${Math.round(path.lengthM)} m of mapped edges` : ''}</p>${alternative ? '<p class="path-note">Travel to or from this different street entrance has not been checked. Review whether that change works for you.</p>' : ''}</div>`;
}
function checkCard(check) {
  const r = check.result, leg = check.leg;
  const alerts = [...r.closures, ...r.advisories];
  return `<article class="check-card"><div class="check-top"><div><h2>${escape(leg.stationName)}</h2><p class="check-endpoints">${escape(leg.fromName)} → ${escape(leg.toName)}</p></div><span class="status-badge ${escape(r.status)}">${escape(statuses[r.status] ?? r.status)}</span></div><p class="result-summary">${escape(r.summary)}</p>${r.status === 'alternate_entrance' ? '' : pathCard(r.path, 'Mapped path inspected')}${r.alternatives.map(alternative => pathCard(alternative.path, `Alternative ${alternative.changeType === 'exit' ? 'exit' : 'entrance'}: ${alternative.entranceName}`, true)).join('')}${alerts.map(alert => `<div class="closure"><p>${escape(alert.header)}</p>${alert.simulation ? '<small>Invented for this demonstration</small>' : sourceLink(alert.url, 'Inspect official report')}</div>`).join('')}<details class="evidence"><summary>Inspect source evidence &amp; limits</summary><ul class="limitations">${r.limitations.map(item => `<li>${escape(item)}</li>`).join('')}</ul><p>${sourceLink(r.evidence?.networkSourceUrl, 'Station map source')} ${sourceLink(r.evidence?.sourceUrl, 'Alert feed')}</p><pre>${escape(JSON.stringify({evidence:r.evidence,path:r.path,alternatives:r.alternatives},null,2))}</pre></details></article>`;
}
function renderReport(report) {
  state.report = report; state.expired = false;
  document.querySelectorAll('[data-scenario]').forEach(button => button.classList.toggle('selected', report.source.scenario === button.dataset.scenario));
  const replay = report.source.mode === 'replay';
  $('#results').classList.remove('is-expired');
  $('#results').innerHTML = `${replay ? '<div class="replay-banner"><strong>Demonstration replay.</strong> The map is real; every alert in this result is invented. It is not a current departure check.</div>' : ''}<div id="expired-message" hidden class="expired-banner">This result has expired. Check current reports again before using it.</div>${report.checks.map(checkCard).join('')}<p class="report-context"><strong>${escape(report.journeyName)}</strong> · ${replay ? 'Replay evaluated' : 'Alerts fetched'} ${escape(time(replay ? report.source.evaluatedAt : report.source.fetchedAt))}<br>${escape(report.source.error ?? report.scope)}</p>`;
  updateFreshness();
  $('#export').disabled = false;
}
function updateFreshness() {
  if (!state.report) return;
  const source = state.report.source, replay = source.mode === 'replay';
  const expired = !replay && (!source.complete || !source.validUntil || Date.now() >= Date.parse(source.validUntil));
  $('#source-pill').className = `source-pill ${replay ? 'replay' : expired ? 'expired' : 'live'}`;
  $('#source-pill').textContent = replay ? 'SYNTHETIC OUTAGE REPLAY' : expired ? 'Current evidence unavailable — check again' : `MBTA REPORTS · fetched ${time(source.fetchedAt)}`;
  if ($('#expired-message')) $('#expired-message').hidden = !expired;
  $('#results').classList.toggle('is-expired', expired);
  state.expired = expired;
}

$('#station').addEventListener('change', populateEndpoints);
$('#check-form').addEventListener('submit', event => {event.preventDefault(); action(async () => renderReport(await tool('check_station_path', selectedLeg())));});
document.querySelectorAll('[data-scenario]').forEach(button => button.addEventListener('click', () => action(async () => renderReport(await tool('run_assembly_replay', {scenario: button.dataset.scenario})))));
$('#add-leg').addEventListener('click', () => {
  if (state.pending.length >= 4) {showError('A saved journey can hold four station checks.'); return;}
  const leg = selectedLeg();
  if (state.pending.some(existing => JSON.stringify(existing) === JSON.stringify(leg))) {showError('That station path is already in this journey.'); return;}
  showError(''); state.pending.push(leg); renderPending(); $('#journey-name').focus();
});
$('#clear-pending').addEventListener('click', () => {state.pending = []; renderPending();});
$('#save-form').addEventListener('submit', event => {
  event.preventDefault();
  action(async () => {
    try {state.saved = await tool('save_journey', {name: $('#journey-name').value.trim(), legs: state.pending, expectedRevision: state.saved.revision});}
    catch (error) {state.saved = await tool('get_saved_journeys'); renderSaved(); throw error;}
    state.pending = []; $('#journey-name').value = ''; renderPending(); renderSaved();
  });
});
$('#export').addEventListener('click', () => {
  if (!state.report) return;
  const blob = new Blob([JSON.stringify(state.report,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `liftcheck-${state.report.source.mode}-${state.report.id}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('#mcp-address').textContent = `${location.origin}/mcp`;
setInterval(updateFreshness, 10_000);
await action(async () => {
  const [catalog,saved] = await Promise.all([tool('get_station_catalog'),tool('get_saved_journeys')]);
  state.catalog = catalog.stations; state.saved = saved;
  $('#station').innerHTML = state.catalog.map(row => `<option value="${escape(row.id)}">${escape(row.name)}</option>`).join('');
  $('#station').value = 'place-astao'; populateEndpoints(); renderSaved();
});
