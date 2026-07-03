/* ============================================================
   NutriAI Agent — Frontend JavaScript
   File: static/js/app.js
============================================================ */

'use strict';

// ============================================================
//  STATE
// ============================================================
const state = {
  conversationHistory: [],
  familyMembers: [],
  userProfile: {},
  isDarkMode: false,
};

// ============================================================
//  DOM HELPERS
// ============================================================
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

function formatTime(isoString) {
  const d = isoString ? new Date(isoString) : new Date();
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Convert **bold** and bullet lines in AI text to basic HTML */
function renderMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^#{1,3}\s(.+)$/gm, '<strong>$1</strong>')
    .replace(/^[-•]\s(.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(.+)$/gm, (line) =>
      line.startsWith('<') ? line : `<p>${line}</p>`
    )
    .replace(/<p><\/p>/g, '');
}

function showLoading(containerId, message = 'Generating AI response…') {
  $(containerId).innerHTML = `
    <div class="loading-spinner">
      <div class="spinner-border" role="status" style="width:2.5rem;height:2.5rem;"></div>
      <div class="text-muted">${message}</div>
    </div>`;
}

function showError(containerId, message) {
  $(containerId).innerHTML = `
    <div class="alert alert-danger d-flex align-items-center gap-2 m-0">
      <i class="bi bi-exclamation-triangle-fill"></i>
      <span>${message}</span>
    </div>`;
}

// ============================================================
//  DARK MODE
// ============================================================
function initTheme() {
  const saved = localStorage.getItem('nutriai-theme');
  if (saved === 'dark') applyDarkMode(true, false);
}

function applyDarkMode(isDark, save = true) {
  state.isDarkMode = isDark;
  document.documentElement.setAttribute('data-bs-theme', isDark ? 'dark' : 'light');
  const icon = $('themeIcon');
  if (icon) {
    icon.className = isDark ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
  }
  if (save) localStorage.setItem('nutriai-theme', isDark ? 'dark' : 'light');
}

$('themeToggle')?.addEventListener('click', () => applyDarkMode(!state.isDarkMode));

// ============================================================
//  USER PROFILE
// ============================================================
function getProfile() {
  return {
    name:              $('profileName')?.value.trim() || '',
    age:               $('profileAge')?.value || '',
    gender:            $('profileGender')?.value || '',
    weight:            $('profileWeight')?.value || '',
    height:            $('profileHeight')?.value || '',
    goal:              $('profileGoal')?.value || '',
    diet_type:         $('profileDiet')?.value || '',
    health_conditions: $('profileHealth')?.value.trim() || '',
    allergies:         $('profileAllergies')?.value.trim() || '',
    activity:          $('profileActivity')?.value || 'moderate',
  };
}

function saveProfile() {
  state.userProfile = getProfile();
  localStorage.setItem('nutriai-profile', JSON.stringify(state.userProfile));
  const msg = document.querySelector('.profile-saved-msg');
  if (msg) {
    msg.classList.remove('d-none');
    setTimeout(() => msg.classList.add('d-none'), 2500);
  }
}

function loadProfile() {
  const saved = localStorage.getItem('nutriai-profile');
  if (!saved) return;
  try {
    const p = JSON.parse(saved);
    const setVal = (id, val) => { if ($(id) && val) $(id).value = val; };
    setVal('profileName',      p.name);
    setVal('profileAge',       p.age);
    setVal('profileGender',    p.gender);
    setVal('profileWeight',    p.weight);
    setVal('profileHeight',    p.height);
    setVal('profileGoal',      p.goal);
    setVal('profileDiet',      p.diet_type);
    setVal('profileHealth',    p.health_conditions);
    setVal('profileAllergies', p.allergies);
    state.userProfile = p;
  } catch (_) { /* ignore corrupted data */ }
}

$('saveProfile')?.addEventListener('click', saveProfile);

// ============================================================
//  CHAT
// ============================================================
function appendMessage(role, content, timestamp) {
  const container = $('chatMessages');
  if (!container) return;

  const isUser = role === 'user';
  const initials = (state.userProfile.name || 'U').charAt(0).toUpperCase();
  const time = formatTime(timestamp);

  const row = document.createElement('div');
  row.className = `message-row ${isUser ? 'user-row' : 'assistant-row'}`;
  row.innerHTML = `
    <div class="avatar ${isUser ? 'avatar-user' : 'avatar-ai'}">
      ${isUser ? initials : '<i class="bi bi-heart-pulse-fill"></i>'}
    </div>
    <div class="message-bubble ${isUser ? 'user-bubble' : 'assistant-bubble'}">
      <div class="message-content">${isUser ? escapeHtml(content) : renderMarkdown(content)}</div>
      <div class="message-time">${time}</div>
    </div>`;
  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function setTyping(visible) {
  const el = $('typingIndicator');
  if (el) el.classList.toggle('d-none', !visible);
  const container = $('chatMessages');
  if (container) container.scrollTop = container.scrollHeight;
}

function setSendDisabled(disabled) {
  const btn = $('sendBtn');
  const input = $('chatInput');
  if (btn) btn.disabled = disabled;
  if (input) input.disabled = disabled;
}

async function sendMessage(messageText) {
  const text = (messageText || $('chatInput')?.value || '').trim();
  if (!text) return;

  if (!messageText) { // clear input only when typed by user
    $('chatInput').value = '';
    $('charCount').textContent = '0/2000';
  }

  appendMessage('user', text, new Date().toISOString());
  state.conversationHistory.push({ role: 'user', content: text });

  setTyping(true);
  setSendDisabled(true);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history: state.conversationHistory.slice(-12),
        profile: getProfile(),
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    appendMessage('assistant', data.response, data.timestamp);
    state.conversationHistory.push({ role: 'assistant', content: data.response });
  } catch (err) {
    appendMessage('assistant',
      `⚠️ **Error:** ${err.message || 'Failed to connect. Please check your configuration.'}`,
      new Date().toISOString()
    );
  } finally {
    setTyping(false);
    setSendDisabled(false);
    $('chatInput')?.focus();
  }
}

// Chat event listeners
$('sendBtn')?.addEventListener('click', () => sendMessage());

$('chatInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.ctrlKey) sendMessage();
});

$('chatInput')?.addEventListener('input', function () {
  const count = $('charCount');
  if (count) count.textContent = `${this.value.length}/2000`;
});

$('clearChat')?.addEventListener('click', () => {
  const container = $('chatMessages');
  if (container) {
    container.innerHTML = '';
    state.conversationHistory = [];
    // Re-add welcome message
    appendMessage('assistant',
      '👋 Chat cleared! How can I help you with your nutrition goals today?',
      new Date().toISOString()
    );
  }
});

// Quick question buttons
$$('.btn-quick').forEach(btn => {
  btn.addEventListener('click', () => {
    const q = btn.getAttribute('data-question');
    if (q) {
      // Switch to chat tab
      document.querySelector('#chat-tab')?.click();
      sendMessage(q);
    }
  });
});

// ============================================================
//  BMI CALCULATOR
// ============================================================
async function calculateBMI() {
  const weight = parseFloat($('bmiWeight')?.value);
  const height = parseFloat($('bmiHeight')?.value);

  if (!weight || !height || weight <= 0 || height <= 0) {
    alert('Please enter valid weight and height values.');
    return;
  }

  try {
    const res = await fetch('/api/bmi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weight_kg: weight, height_cm: height }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    displayBMIResults(data);
  } catch (err) {
    alert(`BMI calculation failed: ${err.message}`);
  }
}

function displayBMIResults(data) {
  // Update circle
  const circle = $('bmiCircle');
  const colors = { success: '#27ae60', warning: '#e67e22', danger: '#c0392b', info: '#3b9dd4' };
  const color = colors[data.color] || '#718096';
  if (circle) circle.style.borderColor = color;

  const bmiValueEl = $('bmiValue');
  if (bmiValueEl) {
    bmiValueEl.textContent = data.bmi;
    bmiValueEl.style.color = color;
  }
  const bmiLabelEl = $('bmiCategoryLabel');
  if (bmiLabelEl) bmiLabelEl.textContent = data.category;

  // Show results
  const results = $('bmiResults');
  if (results) results.classList.remove('d-none');

  if ($('bmiResultVal')) $('bmiResultVal').textContent = data.bmi;
  if ($('bmiIdealRange')) $('bmiIdealRange').textContent = `${data.ideal_weight_min}–${data.ideal_weight_max} kg`;
  if ($('bmiAdviceText')) $('bmiAdviceText').textContent = data.advice;

  const badge = $('bmiCategoryBadge');
  if (badge) {
    const badgeClasses = { success: 'bg-success', warning: 'bg-warning text-dark', danger: 'bg-danger', info: 'bg-info text-dark' };
    badge.className = `badge ${badgeClasses[data.color] || 'bg-secondary'}`;
    badge.textContent = data.category;
  }

  const adviceBox = $('bmiAdviceBox');
  if (adviceBox) {
    const alertClasses = { success: 'alert-success', warning: 'alert-warning', danger: 'alert-danger', info: 'alert-info' };
    adviceBox.className = `alert alert-sm ${alertClasses[data.color] || 'alert-secondary'}`;
  }

  // BMI scale pointer
  updateBMIPointer(data.bmi);
}

function updateBMIPointer(bmi) {
  const pointer = $('bmiPointer');
  if (!pointer) return;
  pointer.classList.remove('d-none');
  // Map BMI 10–50 to 0–100%
  const clampedBMI = Math.max(10, Math.min(50, bmi));
  const pct = ((clampedBMI - 10) / 40) * 100;
  pointer.style.left = `${pct}%`;
}

$('calcBmiBtn')?.addEventListener('click', calculateBMI);

// AI advice for BMI
$('getBmiAdvice')?.addEventListener('click', async () => {
  const bmiVal = $('bmiValue')?.textContent;
  const bmiCat = $('bmiCategoryLabel')?.textContent;
  const age    = $('bmiAgeInput')?.value || '30';
  const diet   = $('bmiDietInput')?.value || 'vegetarian';

  if (!bmiVal || bmiVal === '?') {
    alert('Please calculate your BMI first.');
    return;
  }

  const adviceEl  = $('bmiAiAdvice');
  const adviceBox = $('bmiAiAdviceText');
  if (adviceEl) adviceEl.classList.remove('d-none');
  if (adviceBox) adviceBox.textContent = 'Generating personalized advice…';

  const message = `My BMI is ${bmiVal} (${bmiCat}). I am ${age} years old and follow a ${diet} diet. Give me specific Indian food recommendations, lifestyle changes, and a simple 3-day meal plan to reach a healthy BMI.`;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: [], profile: {} }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    if (adviceBox) adviceBox.textContent = data.response;
  } catch (err) {
    if (adviceBox) adviceBox.textContent = `Error: ${err.message}`;
  }
});

// ============================================================
//  DASHBOARD — CALORIE CALCULATOR
// ============================================================
async function calculateDashboard() {
  const weight   = parseFloat($('dashWeight')?.value);
  const height   = parseFloat($('dashHeight')?.value);
  const age      = parseInt($('dashAge')?.value);
  const gender   = $('dashGender')?.value;
  const activity = $('dashActivity')?.value;
  const goal     = $('dashGoal')?.value;

  if (!weight || !height || !age) {
    alert('Please fill in weight, height, and age.');
    return;
  }

  try {
    const res = await fetch('/api/calories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weight_kg: weight, height_cm: height, age, gender, activity, goal }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    displayDashboardResults(data);
  } catch (err) {
    showError('dashResults', err.message);
  }
}

function displayDashboardResults(data) {
  // Update stat cards
  if ($('dashCalories')) $('dashCalories').textContent = data.target_calories;
  if ($('dashProtein'))  $('dashProtein').textContent  = data.protein_g + 'g';
  if ($('dashCarbs'))    $('dashCarbs').textContent    = data.carbs_g + 'g';
  if ($('dashFats'))     $('dashFats').textContent     = data.fats_g + 'g';

  const totalMacroG = data.protein_g + data.carbs_g + data.fats_g;
  const protPct = Math.round((data.protein_g / totalMacroG) * 100);
  const carbPct = Math.round((data.carbs_g  / totalMacroG) * 100);
  const fatPct  = Math.round((data.fats_g   / totalMacroG) * 100);

  $('dashResults').innerHTML = `
    <div class="calorie-result mb-3">
      <div class="calorie-big">${data.target_calories}</div>
      <div class="fw-semibold text-muted">kcal / day · ${data.goal}</div>
      <div class="bmr-info mt-1">BMR: ${data.bmr} kcal &nbsp;|&nbsp; TDEE: ${data.tdee} kcal</div>
    </div>
    <div class="macro-bars">
      <div class="macro-bar-item">
        <div class="macro-bar-label">
          <span>Protein</span>
          <span>${data.protein_g}g (${protPct}%)</span>
        </div>
        <div class="progress"><div class="progress-bar progress-bar-protein" style="width:${protPct}%"></div></div>
      </div>
      <div class="macro-bar-item">
        <div class="macro-bar-label">
          <span>Carbohydrates</span>
          <span>${data.carbs_g}g (${carbPct}%)</span>
        </div>
        <div class="progress"><div class="progress-bar progress-bar-carbs" style="width:${carbPct}%"></div></div>
      </div>
      <div class="macro-bar-item">
        <div class="macro-bar-label">
          <span>Fats</span>
          <span>${data.fats_g}g (${fatPct}%)</span>
        </div>
        <div class="progress"><div class="progress-bar progress-bar-fats" style="width:${fatPct}%"></div></div>
      </div>
    </div>
    <div class="mt-3 p-2 rounded" style="background:var(--bg-body);font-size:.8rem;color:var(--text-muted);">
      <i class="bi bi-info-circle me-1"></i>
      Values calculated using the Mifflin-St Jeor equation.
      Consult a dietitian for personalized medical-grade advice.
    </div>`;
}

$('calcDashBtn')?.addEventListener('click', calculateDashboard);

// ============================================================
//  MEAL PLANNER
// ============================================================
async function generateMealPlan() {
  const profile = {
    name:             $('mealName')?.value.trim()  || 'Friend',
    age:              $('mealAge')?.value           || '',
    gender:           $('mealGender')?.value        || 'male',
    weight:           $('mealWeight')?.value        || '',
    height:           $('mealHeight')?.value        || '',
    goal:             $('mealGoal')?.value          || 'maintenance',
    diet_type:        $('mealDiet')?.value          || 'vegetarian',
    health_conditions:$('mealHealth')?.value.trim() || 'none',
  };
  const days        = $('mealDays')?.value  || 7;
  const preferences = $('mealPreferences')?.value.trim() || '';

  showLoading('mealPlanOutput', 'Generating your personalized meal plan…');
  $('generateMealPlan').disabled = true;
  $('copyMealPlan')?.classList.add('d-none');

  try {
    const res = await fetch('/api/meal-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile, days: parseInt(days), preferences }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    $('mealPlanOutput').innerHTML = `
      <div class="ai-output">${escapeHtml(data.meal_plan)}</div>`;
    $('copyMealPlan')?.classList.remove('d-none');
  } catch (err) {
    showError('mealPlanOutput', err.message);
  } finally {
    $('generateMealPlan').disabled = false;
  }
}

$('generateMealPlan')?.addEventListener('click', generateMealPlan);

$('copyMealPlan')?.addEventListener('click', () => {
  const text = document.querySelector('#mealPlanOutput .ai-output')?.textContent;
  if (text) {
    navigator.clipboard.writeText(text).then(() => {
      $('copyMealPlan').innerHTML = '<i class="bi bi-check2 me-1"></i>Copied!';
      setTimeout(() => {
        $('copyMealPlan').innerHTML = '<i class="bi bi-clipboard me-1"></i>Copy';
      }, 2000);
    });
  }
});

// ============================================================
//  FOOD ANALYZER
// ============================================================
async function analyzeFood() {
  const desc = $('foodDescription')?.value.trim();
  if (!desc) { alert('Please describe the food or meal.'); return; }

  showLoading('foodAnalysisOutput', 'Analyzing nutritional content…');
  $('analyzeFood').disabled = true;

  try {
    const res = await fetch('/api/analyze-food', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ food_description: desc }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    $('foodAnalysisOutput').innerHTML = `
      <div class="mb-2 p-2 rounded" style="background:rgba(46,204,135,.08);border:1px solid rgba(46,204,135,.2);">
        <small class="text-muted"><i class="bi bi-bowl-hot me-1"></i>Analyzed:</small>
        <strong>${escapeHtml(data.food)}</strong>
      </div>
      <div class="ai-output">${escapeHtml(data.analysis)}</div>`;
  } catch (err) {
    showError('foodAnalysisOutput', err.message);
  } finally {
    $('analyzeFood').disabled = false;
  }
}

$('analyzeFood')?.addEventListener('click', analyzeFood);

// Quick food examples
$$('.btn-quick-sm').forEach(btn => {
  btn.addEventListener('click', () => {
    const food = btn.getAttribute('data-food');
    if (food && $('foodDescription')) $('foodDescription').value = food;
  });
});

// ============================================================
//  FAMILY PROFILE
// ============================================================
function renderFamilyMembers() {
  const container = $('familyMembersContainer');
  const emptyState = $('familyEmptyState');
  if (!container) return;

  container.innerHTML = '';
  if (state.familyMembers.length === 0) {
    emptyState?.classList.remove('d-none');
    return;
  }
  emptyState?.classList.add('d-none');

  const relationIcons = {
    Self: '👤', Spouse: '💑', Son: '👦', Daughter: '👧',
    Father: '👨', Mother: '👩', Grandparent: '👴',
  };

  state.familyMembers.forEach((member, idx) => {
    const div = document.createElement('div');
    div.className = 'family-member-card';
    const icon = relationIcons[member.relation] || '👤';
    const initials = (member.name || 'M').charAt(0).toUpperCase();
    div.innerHTML = `
      <div class="member-avatar">${initials}</div>
      <div class="member-info">
        <div class="member-name">${icon} ${escapeHtml(member.name)} <span class="text-muted" style="font-size:.78rem;font-weight:400;">(${member.relation || 'Member'})</span></div>
        <div class="member-meta">
          ${member.age ? `${member.age} yrs` : ''} ${member.gender ? `· ${member.gender}` : ''}
          ${member.weight ? `· ${member.weight}kg` : ''} ${member.height ? `· ${member.height}cm` : ''}
        </div>
        <div class="member-badges">
          ${member.goal      ? `<span class="member-badge-item">${member.goal}</span>` : ''}
          ${member.conditions? `<span class="member-badge-item">${member.conditions}</span>` : ''}
          ${member.activity  ? `<span class="member-badge-item">${member.activity}</span>` : ''}
        </div>
      </div>
      <button class="btn btn-sm btn-outline-danger ms-auto" data-idx="${idx}" title="Remove">
        <i class="bi bi-trash3"></i>
      </button>`;
    container.appendChild(div);
  });

  // Remove button handlers
  container.querySelectorAll('[data-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-idx'));
      state.familyMembers.splice(idx, 1);
      saveFamilyToStorage();
      renderFamilyMembers();
    });
  });
}

function saveFamilyToStorage() {
  localStorage.setItem('nutriai-family', JSON.stringify(state.familyMembers));
}

function loadFamilyFromStorage() {
  const saved = localStorage.getItem('nutriai-family');
  if (saved) {
    try { state.familyMembers = JSON.parse(saved); renderFamilyMembers(); } catch (_) {}
  }
}

$('addFamilyMember')?.addEventListener('click', () => {
  // Clear modal fields
  ['fmName','fmAge','fmWeight','fmHeight','fmConditions'].forEach(id => { if ($(id)) $(id).value = ''; });
  const modal = new bootstrap.Modal($('familyMemberModal'));
  modal.show();
});

$('saveFamilyMember')?.addEventListener('click', () => {
  const name = $('fmName')?.value.trim();
  if (!name) { alert('Please enter a name.'); return; }

  state.familyMembers.push({
    name,
    relation:   $('fmRelation')?.value   || 'Member',
    age:        $('fmAge')?.value        || '',
    gender:     $('fmGender')?.value     || 'male',
    weight:     $('fmWeight')?.value     || '',
    height:     $('fmHeight')?.value     || '',
    goal:       $('fmGoal')?.value       || 'maintenance',
    activity:   $('fmActivity')?.value   || 'moderate',
    conditions: $('fmConditions')?.value.trim() || '',
  });

  saveFamilyToStorage();
  renderFamilyMembers();
  bootstrap.Modal.getInstance($('familyMemberModal'))?.hide();
});

async function generateFamilyPlan() {
  if (state.familyMembers.length === 0) {
    alert('Please add at least one family member first.');
    return;
  }

  showLoading('familyPlanOutput', 'Generating family nutrition plan…');
  $('generateFamilyPlan').disabled = true;

  try {
    const res = await fetch('/api/family-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ members: state.familyMembers }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    $('familyPlanOutput').innerHTML = `
      <div class="mb-2 p-2 rounded d-flex align-items-center gap-2"
           style="background:rgba(46,204,135,.08);border:1px solid rgba(46,204,135,.2);">
        <i class="bi bi-people-fill text-success"></i>
        <span><strong>${data.member_count} family member(s)</strong> — Unified Nutrition Plan</span>
      </div>
      <div class="ai-output">${escapeHtml(data.family_plan)}</div>`;
  } catch (err) {
    showError('familyPlanOutput', err.message);
  } finally {
    $('generateFamilyPlan').disabled = false;
  }
}

$('generateFamilyPlan')?.addEventListener('click', generateFamilyPlan);

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadProfile();
  loadFamilyFromStorage();

  // Focus chat input on chat tab show
  document.querySelector('#chat-tab')?.addEventListener('shown.bs.tab', () => {
    $('chatInput')?.focus();
  });

  // Pre-fill meal planner from profile
  document.querySelector('#meals-tab')?.addEventListener('shown.bs.tab', () => {
    const p = state.userProfile;
    if (p.name  && $('mealName'))   $('mealName').value   = p.name;
    if (p.age   && $('mealAge'))    $('mealAge').value    = p.age;
    if (p.gender&& $('mealGender')) $('mealGender').value = p.gender;
    if (p.weight&& $('mealWeight')) $('mealWeight').value = p.weight;
    if (p.height&& $('mealHeight')) $('mealHeight').value = p.height;
    if (p.goal  && $('mealGoal'))   $('mealGoal').value   = p.goal === 'lose weight' ? 'weight loss' : p.goal === 'gain weight' ? 'weight gain' : 'maintenance';
    if (p.diet_type && $('mealDiet')) $('mealDiet').value = p.diet_type;
    if (p.health_conditions && $('mealHealth')) $('mealHealth').value = p.health_conditions;
  });

  // Pre-fill BMI from profile
  document.querySelector('#bmi-tab')?.addEventListener('shown.bs.tab', () => {
    const p = state.userProfile;
    if (p.weight && $('bmiWeight')) $('bmiWeight').value = p.weight;
    if (p.height && $('bmiHeight')) $('bmiHeight').value = p.height;
    if (p.age    && $('bmiAgeInput')) $('bmiAgeInput').value = p.age;
  });
});
