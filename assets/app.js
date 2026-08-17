/* Track Splits — pace to target times around the track. No dependencies. */
(function () {
  'use strict';

  var MILE_M = 1609.344;
  var STORE_KEY = 'track-splits:v1';

  /* ------------------------------------------------------------------ *
   * Pace math (pure functions, shared by both tabs)
   * ------------------------------------------------------------------ */

  // "8:00" | "8" | "7:30.5" -> seconds. Returns null when unparseable.
  function parsePace(str) {
    if (typeof str !== 'string') return null;
    var s = str.trim().replace(/\s+/g, '');
    if (!s) return null;

    var m = /^(\d{1,3}):([0-5]?\d(?:\.\d{1,2})?)$/.exec(s);
    if (m) {
      var total = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
      return total > 0 ? total : null;
    }
    // Bare number is read as whole minutes: "8" -> 8:00.
    m = /^(\d{1,3}(?:\.\d{1,2})?)$/.exec(s);
    if (m) {
      var mins = parseFloat(m[1]);
      return mins > 0 ? mins * 60 : null;
    }
    return null;
  }

  function secondsPerMeter(paceSeconds, unit) {
    return paceSeconds / (unit === 'km' ? 1000 : MILE_M);
  }

  function splitFor(meters, secPerMeter) {
    return meters * secPerMeter;
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  // Seconds -> "29.8" | "1:59.3" | "1:04:12.0"
  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '—';
    var tenths = Math.round(seconds * 10);
    var tenth = tenths % 10;
    var whole = (tenths - tenth) / 10;
    var h = Math.floor(whole / 3600);
    var m = Math.floor((whole % 3600) / 60);
    var s = whole % 60;
    if (h > 0) return h + ':' + pad2(m) + ':' + pad2(s) + '.' + tenth;
    if (m > 0) return m + ':' + pad2(s) + '.' + tenth;
    return s + '.' + tenth;
  }

  // Seconds -> "8:00" (pace label, no tenths unless needed)
  function formatPace(seconds) {
    var whole = Math.round(seconds * 10) / 10;
    var m = Math.floor(whole / 60);
    var s = whole - m * 60;
    var str = Number.isInteger(s) ? pad2(s) : (s < 10 ? '0' : '') + s.toFixed(1);
    return m + ':' + str;
  }

  function formatMeters(m) {
    return (Number.isInteger(m) ? m : Math.round(m)) + 'm';
  }

  /* ------------------------------------------------------------------ *
   * Distance presets
   * ------------------------------------------------------------------ */

  var PRESETS = [
    { label: '200m', meters: 200 },
    { label: '400m', meters: 400 },
    { label: '600m', meters: 600 },
    { label: '800m', meters: 800 },
    { label: '1000m', meters: 1000 },
    { label: '1200m', meters: 1200 },
    { label: '1600m', meters: 1600 },
    { label: 'Mile', meters: MILE_M },
    { label: '3200m', meters: 3200 },
    { label: '5K', meters: 5000 }
  ];
  var CUSTOM = 'custom';

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */

  var state = {
    pace: '8:00',
    unit: 'mi',
    selection: '800',   // preset meters as a string, or 'custom'
    custom: 500,
    chartUnit: 'mi'
  };

  var el = {
    paceInput: document.getElementById('pace-input'),
    paceError: document.getElementById('pace-error'),
    chips: document.getElementById('dist-chips'),
    customRow: document.getElementById('custom-row'),
    customInput: document.getElementById('custom-dist'),
    headline: document.getElementById('headline'),
    headlineLabel: document.getElementById('headline-label'),
    headlineTime: document.getElementById('headline-time'),
    headlineSub: document.getElementById('headline-sub'),
    splitsCard: document.getElementById('splits-card'),
    splitsBody: document.getElementById('splits-body'),
    copyBtn: document.getElementById('copy-btn'),
    chartBody: document.getElementById('chart-body'),
    chartTitle: document.getElementById('chart-title'),
    chartPaceHead: document.getElementById('chart-pace-head'),
    chartFilter: document.getElementById('chart-filter'),
    chartScroll: document.getElementById('chart-scroll'),
    tabs: Array.prototype.slice.call(document.querySelectorAll('.tab'))
  };

  function currentDistance() {
    if (state.selection === CUSTOM) {
      var v = parseFloat(state.custom);
      return isFinite(v) && v > 0 ? v : null;
    }
    var m = parseFloat(state.selection);
    return isFinite(m) && m > 0 ? m : null;
  }

  function currentDistanceLabel() {
    if (state.selection === CUSTOM) {
      var d = currentDistance();
      return d ? formatMeters(d) : '';
    }
    var preset = PRESETS.filter(function (p) {
      return String(p.meters) === state.selection;
    })[0];
    return preset ? preset.label : formatMeters(parseFloat(state.selection));
  }

  /* ------------------------------------------------------------------ *
   * Calculator rendering
   * ------------------------------------------------------------------ */

  function buildRows(distance) {
    var rows = [];
    for (var d = 100; d < distance - 1e-9; d += 100) rows.push(d);
    rows.push(distance);
    return rows;
  }

  function render() {
    var paceSeconds = parsePace(state.pace);
    var distance = currentDistance();

    if (paceSeconds === null) {
      showError('Enter a pace like 8:00 or 7:30.');
      return;
    }
    if (distance === null) {
      showError('Enter a distance in meters.');
      return;
    }
    if (distance > 42195) {
      showError('Distance must be 42195m or less.');
      return;
    }
    hideError();

    var spm = secondsPerMeter(paceSeconds, state.unit);
    var marks = buildRows(distance);
    var unitLabel = '/' + state.unit;
    var distLabel = currentDistanceLabel();

    // Headline
    el.headlineLabel.textContent = distLabel + ' @ ' + formatPace(paceSeconds) + unitLabel;
    el.headlineTime.textContent = formatTime(splitFor(distance, spm));
    el.headlineSub.textContent = formatTime(splitFor(400, spm)) + ' per lap · ' +
      formatTime(splitFor(100, spm)) + ' per 100m';
    el.headline.hidden = false;

    // Splits table
    var frag = document.createDocumentFragment();
    var prev = 0;
    marks.forEach(function (mark) {
      var elapsed = splitFor(mark, spm);
      var segment = elapsed - prev;
      prev = elapsed;

      var tr = document.createElement('tr');
      var isLap = Math.abs(mark % 400) < 1e-9;
      if (isLap) tr.className = 'is-lap';

      var tdDist = document.createElement('td');
      tdDist.textContent = formatMeters(mark);
      if (isLap) {
        var badge = document.createElement('span');
        badge.className = 'lap-badge';
        badge.textContent = 'Lap ' + (mark / 400);
        tdDist.appendChild(badge);
      }

      var tdElapsed = document.createElement('td');
      tdElapsed.className = 'elapsed';
      tdElapsed.textContent = formatTime(elapsed);

      var tdSegment = document.createElement('td');
      tdSegment.className = 'segment';
      tdSegment.textContent = formatTime(segment);

      tr.appendChild(tdDist);
      tr.appendChild(tdElapsed);
      tr.appendChild(tdSegment);
      frag.appendChild(tr);
    });

    el.splitsBody.textContent = '';
    el.splitsBody.appendChild(frag);
    el.splitsCard.hidden = false;

    persist();
  }

  function showError(message) {
    el.paceError.textContent = message;
    el.paceError.hidden = false;
    el.headline.hidden = true;
    el.splitsCard.hidden = true;
  }

  function hideError() {
    el.paceError.hidden = true;
    el.paceError.textContent = '';
  }

  function splitsAsText() {
    var paceSeconds = parsePace(state.pace);
    var distance = currentDistance();
    if (paceSeconds === null || distance === null) return '';

    var spm = secondsPerMeter(paceSeconds, state.unit);
    var lines = [
      currentDistanceLabel() + ' @ ' + formatPace(paceSeconds) + '/' + state.unit +
      ' — total ' + formatTime(splitFor(distance, spm))
    ];
    var prev = 0;
    buildRows(distance).forEach(function (mark) {
      var elapsed = splitFor(mark, spm);
      var segment = elapsed - prev;
      prev = elapsed;
      lines.push(formatMeters(mark) + '\t' + formatTime(elapsed) + '\t(' + formatTime(segment) + ')');
    });
    return lines.join('\n');
  }

  function copySplits() {
    var text = splitsAsText();
    if (!text) return;

    var done = function (ok) {
      el.copyBtn.textContent = ok ? 'Copied' : 'Copy failed';
      setTimeout(function () { el.copyBtn.textContent = 'Copy'; }, 1600);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () {
        done(legacyCopy(text));
      });
    } else {
      done(legacyCopy(text));
    }
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  /* ------------------------------------------------------------------ *
   * Pace chart
   * ------------------------------------------------------------------ */

  var CHART_RANGES = {
    mi: { from: 4 * 60, to: 14 * 60, step: 10 },
    km: { from: 2 * 60 + 20, to: 9 * 60, step: 10 }
  };
  var CHART_MARKS = [100, 200, 300, 400];

  function renderChart() {
    var range = CHART_RANGES[state.chartUnit];
    var frag = document.createDocumentFragment();

    for (var pace = range.from; pace <= range.to + 1e-9; pace += range.step) {
      var spm = secondsPerMeter(pace, state.chartUnit);
      var tr = document.createElement('tr');
      tr.dataset.pace = String(pace);
      if (pace % 30 === 0) tr.className = 'is-anchor';

      var th = document.createElement('th');
      th.scope = 'row';
      th.textContent = formatPace(pace);
      tr.appendChild(th);

      CHART_MARKS.forEach(function (mark) {
        var td = document.createElement('td');
        td.textContent = formatTime(splitFor(mark, spm));
        tr.appendChild(td);
      });
      frag.appendChild(tr);
    }

    el.chartBody.textContent = '';
    el.chartBody.appendChild(frag);
    el.chartTitle.textContent = 'Splits by pace (min/' + state.chartUnit + ')';
    el.chartPaceHead.textContent = 'min/' + state.chartUnit;
    highlightChartRow();
  }

  function highlightChartRow() {
    var rows = el.chartBody.querySelectorAll('tr');
    Array.prototype.forEach.call(rows, function (r) { r.classList.remove('is-match'); });

    var target = parsePace(el.chartFilter.value);
    if (target === null) return;

    var best = null;
    var bestDelta = Infinity;
    Array.prototype.forEach.call(rows, function (r) {
      var delta = Math.abs(parseFloat(r.dataset.pace) - target);
      if (delta < bestDelta) { bestDelta = delta; best = r; }
    });
    if (!best) return;

    best.classList.add('is-match');

    // Scroll within the table container only — never move the page.
    if (el.chartScroll.offsetParent === null) return; // panel hidden
    var headHeight = el.chartScroll.querySelector('thead').offsetHeight;
    var delta = best.getBoundingClientRect().top -
      el.chartScroll.getBoundingClientRect().top - headHeight - 8;
    el.chartScroll.scrollTop = Math.max(0, el.chartScroll.scrollTop + delta);
  }

  /* ------------------------------------------------------------------ *
   * Chips, toggles, tabs
   * ------------------------------------------------------------------ */

  function buildChips() {
    var frag = document.createDocumentFragment();
    PRESETS.forEach(function (preset) {
      frag.appendChild(makeChip(preset.label, String(preset.meters)));
    });
    frag.appendChild(makeChip('Custom', CUSTOM));
    el.chips.appendChild(frag);
  }

  function makeChip(label, value) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = label;
    b.dataset.value = value;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', function () {
      state.selection = value;
      syncChips();
      render();
      writeHash();
    });
    return b;
  }

  function syncChips() {
    Array.prototype.forEach.call(el.chips.children, function (chip) {
      var active = chip.dataset.value === state.selection;
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    el.customRow.hidden = state.selection !== CUSTOM;
  }

  function syncUnitButtons() {
    document.querySelectorAll('[data-unit]').forEach(function (b) {
      var active = b.dataset.unit === state.unit;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-chart-unit]').forEach(function (b) {
      var active = b.dataset.chartUnit === state.chartUnit;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function selectTab(tab) {
    el.tabs.forEach(function (t) {
      var active = t === tab;
      t.setAttribute('aria-selected', active ? 'true' : 'false');
      t.tabIndex = active ? 0 : -1;
      document.getElementById(t.dataset.panel).hidden = !active;
    });
  }

  function wireTabs() {
    el.tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () { selectTab(tab); });
      tab.addEventListener('keydown', function (event) {
        var dir = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (!dir) return;
        event.preventDefault();
        var next = el.tabs[(index + dir + el.tabs.length) % el.tabs.length];
        selectTab(next);
        next.focus();
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * URL hash + localStorage
   * ------------------------------------------------------------------ */

  function writeHash() {
    var params = 'pace=' + encodeURIComponent(state.pace.trim()) +
      '&unit=' + state.unit +
      '&dist=' + (state.selection === CUSTOM ? state.custom : state.selection);
    try {
      history.replaceState(null, '', '#' + params);
    } catch (e) { /* file:// or blocked history — ignore */ }
  }

  function readHash() {
    var hash = location.hash.replace(/^#/, '');
    if (!hash) return false;
    var params = {};
    hash.split('&').forEach(function (pair) {
      var kv = pair.split('=');
      if (kv.length === 2) params[kv[0]] = decodeURIComponent(kv[1]);
    });
    return applyParams(params);
  }

  function applyParams(params) {
    var applied = false;
    if (params.pace && parsePace(params.pace) !== null) {
      state.pace = params.pace;
      applied = true;
    }
    if (params.unit === 'mi' || params.unit === 'km') {
      state.unit = params.unit;
      applied = true;
    }
    if (params.dist) {
      var meters = parseFloat(params.dist);
      if (isFinite(meters) && meters > 0 && meters <= 42195) {
        var preset = PRESETS.filter(function (p) {
          return Math.abs(p.meters - meters) < 1e-6;
        })[0];
        if (preset) {
          state.selection = String(preset.meters);
        } else {
          state.selection = CUSTOM;
          state.custom = meters;
        }
        applied = true;
      }
    }
    return applied;
  }

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        pace: state.pace, unit: state.unit,
        selection: state.selection, custom: state.custom,
        chartUnit: state.chartUnit
      }));
    } catch (e) { /* private mode — ignore */ }
  }

  function restore() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!saved) return;
      if (parsePace(saved.pace) !== null) state.pace = saved.pace;
      if (saved.unit === 'mi' || saved.unit === 'km') state.unit = saved.unit;
      if (saved.selection) state.selection = saved.selection;
      if (saved.custom > 0) state.custom = saved.custom;
      if (saved.chartUnit === 'mi' || saved.chartUnit === 'km') state.chartUnit = saved.chartUnit;
    } catch (e) { /* corrupt or blocked — ignore */ }
  }

  /* ------------------------------------------------------------------ *
   * Init
   * ------------------------------------------------------------------ */

  function init() {
    restore();
    readHash(); // a shared link wins over the saved session

    buildChips();
    wireTabs();

    el.paceInput.value = state.pace;
    el.customInput.value = state.custom;
    syncChips();
    syncUnitButtons();

    el.paceInput.addEventListener('input', function () {
      state.pace = el.paceInput.value;
      render();
      writeHash();
    });

    el.customInput.addEventListener('input', function () {
      state.custom = parseFloat(el.customInput.value);
      render();
      writeHash();
    });

    document.querySelectorAll('[data-unit]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.unit = b.dataset.unit;
        syncUnitButtons();
        render();
        writeHash();
      });
    });

    document.querySelectorAll('[data-chart-unit]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.chartUnit = b.dataset.chartUnit;
        syncUnitButtons();
        renderChart();
        persist();
      });
    });

    el.copyBtn.addEventListener('click', copySplits);
    el.chartFilter.addEventListener('input', highlightChartRow);

    window.addEventListener('hashchange', function () {
      if (!readHash()) return;
      el.paceInput.value = state.pace;
      el.customInput.value = state.custom;
      syncChips();
      syncUnitButtons();
      render();
    });

    render();
    renderChart();
  }

  // Exposed for quick console checks / future tests.
  window.TrackSplits = {
    parsePace: parsePace,
    secondsPerMeter: secondsPerMeter,
    splitFor: splitFor,
    formatTime: formatTime,
    formatPace: formatPace
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
