const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const state = {catalog: [], saved: {revision: 0, journeys: []}, pending: [], editing: null, copiedFrom: null, report: null, reportSelection: null, busy: false, expired: false};
const statuses = {no_reported_closure:'No reported closure', alternate_entrance:'Another entrance to review', blocked:'Closure affects this path', unknown:'Could not verify this path'};
const legKey = leg => JSON.stringify([leg.stationId,leg.fromId,leg.toId]);
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
function announce(message) {$('#announcement').textContent = message;}
function showError(message) {
  $('#error').textContent = message; $('#error').hidden = !message;
  if (message) {$('#error').tabIndex = -1; $('#error').focus();}
}
function syncControls() {
  document.querySelectorAll('button').forEach(button => {
    button.disabled = state.busy || button.dataset.unavailable === 'true' ||
      (button.id === 'export' && !state.report) ||
      (['check-live','add-leg'].includes(button.id) && !state.catalog.length) ||
      (button.id === 'save-journey' && state.editing !== null);
  });
  document.querySelectorAll('#check-form select,#check-form input').forEach(control => {control.disabled = state.busy || !state.catalog.length;});
}
function busy(value) {
  state.busy = value; syncControls();
  $('#results').setAttribute('aria-busy', String(value));
  $('#check-live').firstChild.textContent = value ? 'Checking… ' : 'Check current reports ';
}
async function action(fn) {
  if (state.busy) return;
  busy(true); showError('');
  let focusTarget;
  try {focusTarget = await fn();}
  catch (error) {showError(error.name === 'TimeoutError' ? 'The request took too long. No new result is available. Check again when the connection is ready.' : error.message);}
  finally {busy(false);}
  focusTarget?.focus?.();
}
function station() {return state.catalog.find(row => row.id === $('#station').value);}
function selectedLeg() {
  const reverse = $('input[name="direction"]:checked').value === 'exiting';
  return {stationId:$('#station').value, fromId:$(reverse ? '#platform' : '#entrance').value, toId:$(reverse ? '#entrance' : '#platform').value};
}
function populateEndpoints() {
  const current = station(); if (!current) return;
  for (const [selector,values] of [['#entrance',current.entrances],['#platform',current.platforms]]) {
    $(selector).innerHTML = values.map(row => `<option value="${escape(row.id)}">${escape(selector === '#platform' ? row.name.replace(`${current.name} - `, '') : row.name)}</option>`).join('');
  }
  if (current.id === 'place-astao') {$('#entrance').value = 'door-astao-foley'; $('#platform').value = '70278';}
}
function legDescription(leg) {
  const current = state.catalog.find(row => row.id === leg.stationId);
  const endpoints = [...current.entrances,...current.platforms];
  const name = id => (endpoints.find(row => row.id === id)?.name ?? id).replace(`${current.name} - `,'');
  return {station:current.name, path:`${name(leg.fromId)} → ${name(leg.toId)}`};
}
function selectLeg(leg) {
  $('#station').value = leg.stationId; populateEndpoints();
  const boarding = station().entrances.some(row => row.id === leg.fromId);
  $('#entrance').value = boarding ? leg.fromId : leg.toId;
  $('#platform').value = boarding ? leg.toId : leg.fromId;
  $(`input[name="direction"][value="${boarding ? 'boarding' : 'exiting'}"]`).checked = true;
  selectionChanged();
}
function selectionChanged() {
  $('#selection-note').hidden = !state.reportSelection || legKey(selectedLeg()) === state.reportSelection;
}
function renderPending() {
  $('#save-form').hidden = state.pending.length === 0;
  $('#draft-count').textContent = `${state.pending.length} / 4 checks`;
  $('#edit-note').hidden = state.editing === null;
  $('#edit-note').textContent = state.editing === null ? '' : `Editing check ${state.editing + 1}. Change the fields, then choose “Update station check”.`;
  $('#add-leg').textContent = state.editing === null ? '+ Add this check to a saved journey' : 'Update station check';
  $('#cancel-edit').hidden = state.editing === null;
  $('#draft-note').textContent = state.copiedFrom ? `Copied from “${state.copiedFrom}”. Saving creates a new journey; the original stays unchanged. Travel between checks is not checked.` : 'Station checks are separate. Travel between them is not checked.';
  $('#pending-legs').innerHTML = state.pending.map((leg,index) => {
    const description = legDescription(leg);
    return `<li class="${state.editing === index ? 'editing' : ''}"><p class="draft-leg-name"><strong>${index + 1}. ${escape(description.station)}</strong>${escape(description.path)}</p><div class="leg-actions"><button class="leg-action" type="button" data-leg-action="edit" data-index="${index}" aria-label="Edit check ${index + 1}: ${escape(description.station)}">Edit</button><button class="leg-action" type="button" data-leg-action="remove" data-index="${index}" aria-label="Remove check ${index + 1}: ${escape(description.station)}">Remove</button><button class="leg-action move" type="button" data-leg-action="up" data-index="${index}" data-unavailable="${index === 0}" aria-label="Move check ${index + 1} up">↑</button><button class="leg-action move" type="button" data-leg-action="down" data-index="${index}" data-unavailable="${index === state.pending.length - 1}" aria-label="Move check ${index + 1} down">↓</button></div></li>`;
  }).join('');
  syncControls();
}
function renderSaved() {
  $('#saved-list').innerHTML = state.saved.journeys.length ? state.saved.journeys.map(journey => `<div class="saved-item"><button class="saved-check" type="button" data-journey="${escape(journey.id)}"><span>${escape(journey.name)}<small>${journey.legs.length} station check${journey.legs.length === 1 ? '' : 's'}</small></span><span class="arrow" aria-hidden="true">↗</span></button><button class="text-button saved-edit" type="button" data-draft="${escape(journey.id)}" aria-label="Use ${escape(journey.name)} as a draft">Use as draft</button></div>`).join('') : '<p class="muted">Keep up to four station checks together. Save a journey to check them again.</p>';
  document.querySelectorAll('[data-journey]').forEach(button => button.addEventListener('click', () => action(async () => renderReport(await tool('check_journey',{journeyId:button.dataset.journey})))));
  document.querySelectorAll('[data-draft]').forEach(button => button.addEventListener('click', () => {
    if (state.pending.length) {showError('There is already a journey draft. Save it or clear it before using a saved journey as a new draft.'); return;}
    showError('');
    const journey = state.saved.journeys.find(row => row.id === button.dataset.draft);
    state.pending = structuredClone(journey.legs); state.copiedFrom = journey.name; state.editing = null;
    $('#journey-name').value = `${journey.name} copy`.slice(0,80); renderPending(); selectLeg(state.pending[0]);
    announce(`Loaded ${journey.name} as a new draft. The original is unchanged.`); $('#journey-name').focus();
  }));
  syncControls();
}
function safeUrl(value) {
  try {const url = new URL(value); return ['https:','http:'].includes(url.protocol) ? url.href : null;} catch {return null;}
}
function sourceLink(url,label) {
  const href = safeUrl(url); return href ? `<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${escape(label)} <span aria-hidden="true">↗</span></a>` : '';
}
function time(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.valueOf()) ? new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/New_York',timeZoneName:'short'}).format(date) : 'Unavailable';
}
function pathCard(path,title,alternative = false) {
  if (!path) return '';
  const first = path.nodes[0], last = path.nodes.at(-1);
  const nodeKind = id => state.catalog.some(row => row.entrances.some(entry => entry.id === id)) ? 'Street entrance' : 'Platform';
  const shortName = node => {
    const parent = state.catalog.find(row => [...row.entrances,...row.platforms].some(entry => entry.id === node?.id));
    return (node?.name ?? '').replace(`${parent?.name} - `,'');
  };
  const nodes = [{label:shortName(first) || path.fromId,kind:nodeKind(first?.id)}];
  if (path.facilities.length) nodes.push(...path.facilities.map(facility => ({label:`Elevator ${facility.id}`,kind:'Elevator dependency',elevator:true})));
  else nodes.push({label:'Mapped walkways',kind:'Connection'});
  nodes.push({label:shortName(last) || path.toId,kind:nodeKind(last?.id)});
  return `<div class="path-box ${alternative ? 'alternative' : ''}"><div class="path-box-heading"><h3>${escape(title)}</h3><span class="path-tag">${state.report.source.mode === 'replay' ? 'SYNTHETIC REPLAY' : 'DEPENDENCY VIEW'}</span></div><ol class="path-chain">${nodes.map((node,index) => `<li class="chain-node ${node.elevator ? 'elevator' : ''}"><span class="chain-number" aria-hidden="true">${node.elevator ? '↕' : index + 1}</span><span class="chain-type">${escape(node.kind)}</span><span class="chain-label">${escape(node.label)}</span></li>`).join('')}</ol><p class="path-note">${escape(path.metric)} · ${path.edgeCount} mapped connections${Number.isFinite(path.lengthM) ? ` · ${Math.round(path.lengthM)} m of mapped edges` : ''}. Schematic, not walking directions.</p>${alternative ? '<p class="path-note approach-note"><strong>Before changing entrances:</strong> travel to or from this different street entrance has not been checked. Review whether that change works for you.</p>' : ''}</div>`;
}
function checkCard(check,index) {
  const r = check.result, leg = check.leg;
  const boarding = state.catalog.find(row => row.id === leg.stationId)?.entrances.some(row => row.id === leg.fromId);
  const alerts = [...r.closures.map(alert => ({...alert,kind:'closure'})),...r.advisories.map(alert => ({...alert,kind:'advisory'}))];
  const caution = r.status === 'no_reported_closure' || r.status === 'alternate_entrance';
  const source = state.report.source, replay = source.mode === 'replay';
  const provenance = replay ? `Synthetic replay · ${time(source.evaluatedAt)}` : `Live reports · fetched ${time(source.fetchedAt)}`;
  return `<article class="check-card"><p class="card-provenance ${replay ? 'replay' : 'live'}">${escape(provenance)}${replay ? ' · Invented outages' : ''}</p><div class="check-top"><p class="check-kicker">Station check ${String(index + 1).padStart(2,'0')} / ${boarding ? 'Boarding' : 'Exiting'}</p><span class="status-badge ${escape(r.status)}" data-status="${escape(r.status)}">${escape(statuses[r.status] ?? r.status)}</span></div><h2>${escape(leg.stationName)}</h2><p class="check-endpoints">${escape(leg.fromName)} → ${escape(leg.toName)}</p><p class="result-summary">${escape(r.summary)}</p>${r.status === 'alternate_entrance' ? '' : pathCard(r.path,'Mapped path inspected')}${r.alternatives.map(alternative => pathCard(alternative.path,`Alternative ${alternative.changeType === 'exit' ? 'exit' : 'entrance'}: ${alternative.entranceName}`,true)).join('')}${caution ? '<p class="result-limit"><span aria-hidden="true">i</span>No reported closure is not confirmation of physical access. Conditions and assistance still need checking.</p>' : ''}${alerts.map(alert => `<div class="closure ${alert.kind === 'advisory' ? 'advisory' : ''}"><p>${escape(alert.header)}</p>${alert.simulation ? '<small>Invented for this demonstration</small>' : sourceLink(alert.url,'Inspect official report')}</div>`).join('')}${!caution ? '<p class="recovery-link">Review <a href="https://www.mbta.com/accessibility" target="_blank" rel="noopener noreferrer">official MBTA assistance and travel guidance <span aria-hidden="true">↗</span></a>.</p>' : ''}<details class="evidence"><summary>Inspect source evidence &amp; limits</summary><ul class="limitations">${r.limitations.map(item => `<li>${escape(item)}</li>`).join('')}</ul><p class="source-links">${sourceLink(r.evidence?.networkSourceUrl,'Station map source')} ${sourceLink(r.evidence?.sourceUrl,'Alert feed')}</p><pre>${escape(JSON.stringify({evidence:r.evidence,path:r.path,alternatives:r.alternatives},null,2))}</pre></details></article>`;
}
function renderReport(report,selection = null) {
  state.report = report; state.expired = false; state.reportSelection = selection;
  document.querySelectorAll('[data-scenario]').forEach(button => {
    const selected = report.source.scenario === button.dataset.scenario;
    button.classList.toggle('selected',selected); button.setAttribute('aria-pressed',String(selected));
  });
  const replay = report.source.mode === 'replay';
  $('#results').classList.remove('is-expired');
  $('#selection-note').hidden = true;
  $('#report-title').textContent = report.journeyName === 'Station check' ? 'Your path report' : report.journeyName;
  $('#results').innerHTML = `${replay ? '<div class="replay-banner"><strong>Demonstration replay.</strong> The map is real; every alert in this result is invented. It is not a current departure check.</div>' : ''}<div id="expired-message" hidden class="expired-banner"><strong>Current evidence is unavailable.</strong>The path view has been withdrawn. Check current reports again; the earlier evidence is still available to inspect.</div>${report.checks.map(checkCard).join('')}<p class="report-context"><strong>${escape(report.journeyName)}</strong> · ${replay ? 'Replay evaluated' : 'Alerts fetched'} ${escape(time(replay ? report.source.evaluatedAt : report.source.fetchedAt))}<br>${escape(report.source.error ?? report.scope)}</p>`;
  updateFreshness();
  announce(`${replay ? 'Demonstration replay. ' : ''}${report.checks.map(check => `${check.leg.stationName}: ${statuses[check.result.status]}`).join('. ')}${state.expired ? '. Current evidence is unavailable.' : ''}`);
  $('#station-results').scrollIntoView({block:'start'});
  syncControls();
}
function updateFreshness() {
  if (!state.report) return;
  const source = state.report.source, replay = source.mode === 'replay';
  const expiry = Date.parse(source.validUntil), fetched = Date.parse(source.fetchedAt);
  const expired = !replay && (!source.complete || !Number.isFinite(expiry) || !Number.isFinite(fetched) || Date.now() >= expiry || fetched > Date.now());
  $('#source-pill').className = `source-pill ${replay ? 'replay' : expired ? 'expired' : 'live'}`;
  $('#source-pill').textContent = replay ? 'SYNTHETIC OUTAGE REPLAY' : expired ? 'Current evidence unavailable — check again' : 'Live MBTA REPORTS';
  $('#report-timing').textContent = replay ? `Fixed replay · ${time(source.evaluatedAt)}` : expired ? `Last fetch: ${time(source.fetchedAt)}` : `Fetched ${time(source.fetchedAt)} · expires in ${Math.max(1,Math.ceil((expiry - Date.now()) / 60_000))} min`;
  if ($('#expired-message')) $('#expired-message').hidden = !expired;
  $('#results').classList.toggle('is-expired',expired);
  if (!replay) document.querySelectorAll('.card-provenance').forEach(label => {label.textContent = `${expired ? 'Earlier fetch' : 'Live reports'} · fetched ${time(source.fetchedAt)}${expired ? ' · Evidence unavailable' : ''}`;});
  document.querySelectorAll('.status-badge').forEach(badge => {
    badge.textContent = expired ? 'Evidence expired or unavailable' : statuses[badge.dataset.status];
    badge.className = `status-badge ${expired ? 'unknown' : badge.dataset.status}`;
  });
  if (expired && !state.expired) announce('Current station evidence is unavailable. Path views have been withdrawn. Check current reports again.');
  state.expired = expired;
}

$('#station').addEventListener('change',() => {populateEndpoints(); selectionChanged();});
document.querySelectorAll('#entrance,#platform,input[name="direction"]').forEach(control => control.addEventListener('change',selectionChanged));
$('#check-form').addEventListener('submit',event => {
  event.preventDefault(); const leg = selectedLeg(); action(async () => renderReport(await tool('check_station_path',leg),legKey(leg)));
});
document.querySelectorAll('[data-scenario]').forEach(button => button.addEventListener('click',() => action(async () => renderReport(await tool('run_assembly_replay',{scenario:button.dataset.scenario})))));
$('#add-leg').addEventListener('click',() => {
  if (state.editing === null && state.pending.length >= 4) {showError('A saved journey can hold four station checks. Edit or remove a draft check to make room.'); return;}
  const leg = selectedLeg();
  if (state.pending.some((existing,index) => index !== state.editing && legKey(existing) === legKey(leg))) {showError('That station path is already in this journey.'); return;}
  showError('');
  const edited = state.editing !== null;
  if (edited) state.pending[state.editing] = leg; else state.pending.push(leg);
  state.editing = null; renderPending(); announce(edited ? 'Draft station check updated.' : `Station check added. ${state.pending.length} in this draft.`); $('#journey-name').focus();
});
$('#cancel-edit').addEventListener('click',() => {showError(''); state.editing = null; renderPending(); announce('Edit cancelled. The draft check is unchanged.'); $('#add-leg').focus();});
$('#pending-legs').addEventListener('click',event => {
  const button = event.target.closest('[data-leg-action]'); if (!button || state.busy) return;
  showError('');
  const index = Number(button.dataset.index), kind = button.dataset.legAction;
  if (kind === 'edit') {state.editing = index; selectLeg(state.pending[index]); renderPending(); $('#station').focus(); return;}
  if (kind === 'remove') {
    state.pending.splice(index,1);
    if (state.editing === index) state.editing = null; else if (state.editing > index) state.editing--;
    if (!state.pending.length) state.copiedFrom = null;
    renderPending(); announce(`Check ${index + 1} removed from the draft.`);
    (document.querySelector(`[data-leg-action="edit"][data-index="${Math.min(index,state.pending.length - 1)}"]`) ?? $('#add-leg')).focus(); return;
  }
  const target = index + (kind === 'up' ? -1 : 1);
  if (target < 0 || target >= state.pending.length) return;
  [state.pending[index],state.pending[target]] = [state.pending[target],state.pending[index]];
  if (state.editing === index) state.editing = target; else if (state.editing === target) state.editing = index;
  renderPending(); announce(`Check moved to position ${target + 1}.`);
  document.querySelector(`[data-leg-action="edit"][data-index="${target}"]`).focus();
});
$('#clear-pending').addEventListener('click',() => {showError(''); state.pending = []; state.editing = null; state.copiedFrom = null; $('#journey-name').value = ''; renderPending(); announce('Journey draft cleared. Saved journeys are unchanged.'); $('#add-leg').focus();});
$('#save-form').addEventListener('submit',event => {
  event.preventDefault(); if (state.editing !== null) return;
  action(async () => {
    const name = $('#journey-name').value.trim();
    try {state.saved = await tool('save_journey',{name,legs:state.pending,expectedRevision:state.saved.revision});}
    catch (error) {state.saved = await tool('get_saved_journeys'); renderSaved(); throw error;}
    state.pending = []; state.copiedFrom = null; $('#journey-name').value = ''; renderPending(); renderSaved();
    announce(`${name} saved on this device.`);
    return document.querySelector(`[data-journey="${CSS.escape(state.saved.journeys.at(-1).id)}"]`);
  });
});
$('#export').addEventListener('click',() => {
  if (!state.report) return;
  const blob = new Blob([JSON.stringify(state.report,null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `liftcheck-${state.report.source.mode}-${state.report.id}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
});
$('#mcp-address').textContent = `${location.origin}/mcp`;
setInterval(updateFreshness,10_000);
document.addEventListener('visibilitychange',() => {if (!document.hidden) updateFreshness();});
await action(async () => {
  const [catalog,saved] = await Promise.all([tool('get_station_catalog'),tool('get_saved_journeys')]);
  state.catalog = catalog.stations; state.saved = saved;
  $('#station').innerHTML = state.catalog.map(row => `<option value="${escape(row.id)}">${escape(row.name)}</option>`).join('');
  $('#station').value = 'place-astao'; populateEndpoints(); renderSaved();
});
