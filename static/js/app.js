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
  weightLogs: [],
  weightChartInstance: null,
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

/** Convert markdown tags (bold, lists, headers, quotes) to clean HTML */
function renderMarkdown(text) {
  if (!text) return '';
  
  // Split into blocks by double newlines
  const blocks = text.split(/\n\n+/);
  
  const parsedBlocks = blocks.map(block => {
    block = block.trim();
    if (!block) return '';
    
    // Unordered List
    if (block.startsWith('-') || block.startsWith('*') || block.startsWith('•')) {
      const items = block.split(/\n+/).map(line => {
        const itemText = line.replace(/^[-*•]\s+/, '').trim();
        return `<li>${parseInlineMarkdown(itemText)}</li>`;
      }).join('');
      return `<ul>${items}</ul>`;
    }
    
    // Ordered List
    if (/^\d+\.\s+/.test(block)) {
      const items = block.split(/\n+/).map(line => {
        const itemText = line.replace(/^\d+\.\s+/, '').trim();
        return `<li>${parseInlineMarkdown(itemText)}</li>`;
      }).join('');
      return `<ol>${items}</ol>`;
    }
    
    // Headers
    if (block.startsWith('###')) {
      return `<h5>${parseInlineMarkdown(block.replace(/^###\s+/, ''))}</h5>`;
    }
    if (block.startsWith('##')) {
      return `<h4>${parseInlineMarkdown(block.replace(/^##\s+/, ''))}</h4>`;
    }
    if (block.startsWith('#')) {
      return `<h3>${parseInlineMarkdown(block.replace(/^#\s+/, ''))}</h3>`;
    }
    
    // Blockquote
    if (block.startsWith('>')) {
      return `<blockquote class="border-start border-3 ps-3 text-muted" style="border-color: var(--nutriai-primary) !important;">${parseInlineMarkdown(block.replace(/^>\s*/, ''))}</blockquote>`;
    }
    
    // Normal paragraph
    return `<p>${parseInlineMarkdown(block)}</p>`;
  });
  
  return parsedBlocks.filter(b => b).join('\n');
}

function parseInlineMarkdown(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>');
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
    budget_friendly:   $('profileBudgetFriendly')?.checked || false,
    preferred_language:$('languageSelect')?.value || 'English',
    selected_model:    $('watsonxModelSelect')?.value || 'meta-llama/llama-3-3-70b-instruct'
  };
}

async function saveProfile() {
  state.userProfile = getProfile();
  localStorage.setItem('nutriai-profile', JSON.stringify(state.userProfile));
  
  // Sync to database
  try {
    await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.userProfile)
    });
  } catch (err) {
    console.error('Profile DB sync failed:', err);
  }

  const msg = document.querySelector('.profile-saved-msg');
  if (msg) {
    msg.classList.remove('d-none');
    setTimeout(() => msg.classList.add('d-none'), 2500);
  }
}

async function loadProfile() {
  let p = null;
  try {
    // Try to load from database first
    const res = await fetch('/api/profile');
    p = await res.json();
  } catch (err) {
    console.error('Failed to load profile from DB, falling back to local storage:', err);
  }

  if (!p || Object.keys(p).length === 0) {
    const saved = localStorage.getItem('nutriai-profile');
    if (saved) {
      try { p = JSON.parse(saved); } catch (_) {}
    }
  }

  if (!p) return;

  const setVal = (id, val) => { if ($(id) && val !== undefined && val !== null) $(id).value = val; };
  setVal('profileName',      p.name);
  setVal('profileAge',       p.age);
  setVal('profileGender',    p.gender);
  setVal('profileWeight',    p.weight);
  setVal('profileHeight',    p.height);
  setVal('profileGoal',      p.goal);
  setVal('profileDiet',      p.diet_type);
  setVal('profileHealth',    p.health_conditions);
  setVal('profileAllergies', p.allergies);
  
  if ($('profileBudgetFriendly')) $('profileBudgetFriendly').checked = !!p.budget_friendly;
  if ($('languageSelect')) $('languageSelect').value = p.preferred_language || 'English';
  if ($('watsonxModelSelect')) $('watsonxModelSelect').value = p.selected_model || 'meta-llama/llama-3-3-70b-instruct';
  
  state.userProfile = p;
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

async function loadChatHistory() {
  try {
    const res = await fetch('/api/chat-history');
    const messages = await res.json();
    if (messages && messages.length > 0) {
      const container = $('chatMessages');
      if (container) container.innerHTML = '';
      messages.forEach(msg => {
        appendMessage(msg.role, msg.content, msg.timestamp);
        state.conversationHistory.push({ role: msg.role, content: msg.content });
      });
    }
  } catch (err) {
    console.error('Failed to load chat history:', err);
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

$('clearChat')?.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to clear chat history?')) return;
  const container = $('chatMessages');
  if (container) {
    container.innerHTML = '';
    state.conversationHistory = [];
    try {
      await fetch('/api/chat-history', { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to clear chat history from DB:', err);
    }
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
  if (adviceBox) adviceBox.innerHTML = '<div class="spinner-border spinner-border-sm" role="status"></div> Generating personalized advice…';

  const message = `My BMI is ${bmiVal} (${bmiCat}). I am ${age} years old and follow a ${diet} diet. Give me specific Indian food recommendations, lifestyle changes, and a simple 3-day meal plan to reach a healthy BMI.`;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: [], profile: getProfile() }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    if (adviceBox) adviceBox.innerHTML = renderMarkdown(data.response);
  } catch (err) {
    if (adviceBox) adviceBox.innerHTML = `Error: ${err.message}`;
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
  const profile = getProfile();
  profile.name = $('mealName')?.value.trim() || profile.name || 'Friend';
  profile.age = $('mealAge')?.value || profile.age;
  profile.gender = $('mealGender')?.value || profile.gender || 'male';
  profile.weight = $('mealWeight')?.value || profile.weight;
  profile.height = $('mealHeight')?.value || profile.height;
  profile.goal = $('mealGoal')?.value || profile.goal || 'maintenance';
  profile.diet_type = $('mealDiet')?.value || profile.diet_type || 'vegetarian';
  profile.health_conditions = $('mealHealth')?.value.trim() || profile.health_conditions || 'none';

  const days        = $('mealDays')?.value  || 7;
  const preferences = $('mealPreferences')?.value.trim() || '';

  if ($('mealPlanCardTitle')) $('mealPlanCardTitle').textContent = 'Your Personalized Meal Plan';
  showLoading('mealPlanOutput', 'Generating your personalized meal plan…');
  $('generateMealPlan').disabled = true;
  $('copyMealPlan')?.classList.add('d-none');
  $('printMealPlan')?.classList.add('d-none');

  try {
    const res = await fetch('/api/meal-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile, days: parseInt(days), preferences }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    $('mealPlanOutput').innerHTML = `
      <div class="ai-output">${renderMarkdown(data.meal_plan)}</div>`;
    $('copyMealPlan')?.classList.remove('d-none');
    $('printMealPlan')?.classList.remove('d-none');
  } catch (err) {
    showError('mealPlanOutput', err.message);
  } finally {
    $('generateMealPlan').disabled = false;
  }
}

async function generatePantryRecipe() {
  const ingredients = $('pantryIngredients')?.value.trim();
  if (!ingredients) {
    alert('Please list some ingredients in your pantry first.');
    return;
  }

  if ($('mealPlanCardTitle')) $('mealPlanCardTitle').textContent = 'Your AI Pantry Recipe';
  showLoading('mealPlanOutput', 'Watsonx.ai is cooking up a recipe…');
  $('generateRecipeBtn').disabled = true;
  $('copyMealPlan')?.classList.add('d-none');
  $('printMealPlan')?.classList.add('d-none');

  try {
    const res = await fetch('/api/generate-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredients, profile: getProfile() }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    $('mealPlanOutput').innerHTML = `
      <div class="ai-output">${renderMarkdown(data.recipe)}</div>`;
    $('copyMealPlan')?.classList.remove('d-none');
    $('printMealPlan')?.classList.remove('d-none');
  } catch (err) {
    showError('mealPlanOutput', err.message);
  } finally {
    $('generateRecipeBtn').disabled = false;
  }
}

$('generateMealPlan')?.addEventListener('click', generateMealPlan);
$('generateRecipeBtn')?.addEventListener('click', generatePantryRecipe);

$('copyMealPlan')?.addEventListener('click', () => {
  const text = document.querySelector('#mealPlanOutput .ai-output')?.innerText;
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
    const p = getProfile();
    const res = await fetch('/api/analyze-food', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        food_description: desc,
        selected_model: p.selected_model,
        preferred_language: p.preferred_language,
        budget_friendly: p.budget_friendly
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    $('foodAnalysisOutput').innerHTML = `
      <div class="mb-2 p-2 rounded" style="background:rgba(46,204,135,.08);border:1px solid rgba(46,204,135,.2);">
        <small class="text-muted"><i class="bi bi-bowl-hot me-1"></i>Analyzed:</small>
        <strong>${escapeHtml(data.food)}</strong>
      </div>
      <div class="ai-output">${renderMarkdown(data.analysis)}</div>`;
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
async function renderFamilyMembers() {
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

  state.familyMembers.forEach((member) => {
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
      <button class="btn btn-sm btn-outline-danger ms-auto" data-id="${member.id}" title="Remove">
        <i class="bi bi-trash3"></i>
      </button>`;
    container.appendChild(div);
  });

  // Remove button handlers
  container.querySelectorAll('[data-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const dbId = btn.getAttribute('data-id');
      try {
        await fetch(`/api/family-members/${dbId}`, { method: 'DELETE' });
        await loadFamilyMembers();
      } catch (err) {
        console.error('Failed to delete family member:', err);
      }
    });
  });
}

async function loadFamilyMembers() {
  try {
    const res = await fetch('/api/family-members');
    state.familyMembers = await res.json();
    await renderFamilyMembers();
  } catch (err) {
    console.error('Failed to load family members:', err);
  }
}

$('addFamilyMember')?.addEventListener('click', () => {
  ['fmName','fmAge','fmWeight','fmHeight','fmConditions'].forEach(id => { if ($(id)) $(id).value = ''; });
  const modal = new bootstrap.Modal($('familyMemberModal'));
  modal.show();
});

$('saveFamilyMember')?.addEventListener('click', async () => {
  const name = $('fmName')?.value.trim();
  if (!name) { alert('Please enter a name.'); return; }

  const payload = {
    name,
    relation:   $('fmRelation')?.value   || 'Member',
    age:        $('fmAge')?.value        || '',
    gender:     $('fmGender')?.value     || 'male',
    weight:     $('fmWeight')?.value     || '',
    height:     $('fmHeight')?.value     || '',
    goal:       $('fmGoal')?.value       || 'maintenance',
    activity:   $('fmActivity')?.value   || 'moderate',
    conditions: $('fmConditions')?.value.trim() || '',
  };

  try {
    await fetch('/api/family-members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    await loadFamilyMembers();
  } catch (err) {
    console.error('Failed to save family member to DB:', err);
  }

  bootstrap.Modal.getInstance($('familyMemberModal'))?.hide();
});

async function generateFamilyPlan() {
  if (state.familyMembers.length === 0) {
    alert('Please add at least one family member first.');
    return;
  }

  showLoading('familyPlanOutput', 'Generating family nutrition plan…');
  $('generateFamilyPlan').disabled = true;
  $('printFamilyPlan')?.classList.add('d-none');

  try {
    const p = getProfile();
    const res = await fetch('/api/family-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        members: state.familyMembers,
        selected_model: p.selected_model,
        preferred_language: p.preferred_language,
        budget_friendly: p.budget_friendly
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    $('familyPlanOutput').innerHTML = `
      <div class="mb-2 p-2 rounded d-flex align-items-center gap-2"
           style="background:rgba(46,204,135,.08);border:1px solid rgba(46,204,135,.2);">
         <i class="bi bi-people-fill text-success"></i>
         <span><strong>${data.member_count} family member(s)</strong> — Unified Nutrition Plan</span>
      </div>
      <div class="ai-output">${renderMarkdown(data.family_plan)}</div>`;
    $('printFamilyPlan')?.classList.remove('d-none');
  } catch (err) {
    showError('familyPlanOutput', err.message);
  } finally {
    $('generateFamilyPlan').disabled = false;
  }
}

$('generateFamilyPlan')?.addEventListener('click', generateFamilyPlan);

// ============================================================
//  WEIGHT & BMI PROGRESS TRACKER (CHART.JS)
// ============================================================
async function loadWeightLogs() {
  try {
    const res = await fetch('/api/weight-logs');
    state.weightLogs = await res.json();
    renderWeightChart();
  } catch (err) {
    console.error('Failed to load weight logs:', err);
  }
}

async function logTodayWeight() {
  const w = parseFloat($('logWeightVal')?.value);
  const h = parseFloat($('logHeightVal')?.value);
  if (!w || !h || w <= 0 || h <= 0) {
    alert('Please enter a valid weight and height.');
    return;
  }

  try {
    const res = await fetch('/api/weight-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weight: w, height: h })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    // Reset weight input
    if ($('logWeightVal')) $('logWeightVal').value = '';
    
    // Refresh weight logs
    await loadWeightLogs();
  } catch (err) {
    alert('Failed to log weight: ' + err.message);
  }
}

function renderWeightChart() {
  const canvas = $('weightProgressChart');
  const emptyState = $('weightChartEmpty');
  if (!canvas) return;

  if (state.weightLogs.length === 0) {
    canvas.style.display = 'none';
    emptyState?.classList.remove('d-none');
    return;
  }
  canvas.style.display = 'block';
  emptyState?.classList.add('d-none');

  const labels = state.weightLogs.map(log => {
    const d = new Date(log.date);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  });
  const weights = state.weightLogs.map(log => log.weight);
  const bmis = state.weightLogs.map(log => log.bmi);

  if (state.weightChartInstance) {
    state.weightChartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');
  const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
  const textColor = isDark ? '#a0aec0' : '#4a5568';
  const gridColor = isDark ? '#3d444d' : '#e2e8f0';

  state.weightChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Weight (kg)',
          data: weights,
          borderColor: '#2ecc71',
          backgroundColor: 'rgba(46, 204, 113, 0.1)',
          yAxisID: 'y',
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 4,
        },
        {
          label: 'BMI',
          data: bmis,
          borderColor: '#3498db',
          backgroundColor: 'rgba(52, 152, 219, 0.1)',
          yAxisID: 'y1',
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 4,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          grid: { color: gridColor },
          ticks: { color: textColor },
          title: { display: true, text: 'Weight (kg)', color: textColor }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { color: textColor },
          title: { display: true, text: 'BMI', color: textColor }
        }
      },
      plugins: {
        legend: {
          labels: { color: textColor }
        }
      }
    }
  });
}

function initPrintHandlers() {
  $('printMealPlan')?.addEventListener('click', () => {
    const card = $('mealPlanOutput').closest('.panel-card');
    if (card) {
      card.classList.add('print-target');
      window.print();
      card.classList.remove('print-target');
    }
  });

  $('printFamilyPlan')?.addEventListener('click', () => {
    const card = $('familyPlanOutput').closest('.panel-card');
    if (card) {
      card.classList.add('print-target');
      window.print();
      card.classList.remove('print-target');
    }
  });
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  await loadProfile();
  await loadChatHistory();
  await loadFamilyMembers();
  await loadWeightLogs();
  initPrintHandlers();

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
    if (p.weight && $('bmiWeight')) {
      $('bmiWeight').value = p.weight;
      if ($('logWeightVal')) $('logWeightVal').value = p.weight;
    }
    if (p.height && $('bmiHeight')) {
      $('bmiHeight').value = p.height;
      if ($('logHeightVal')) $('logHeightVal').value = p.height;
    }
    if (p.age    && $('bmiAgeInput')) $('bmiAgeInput').value = p.age;
  });

  // Sync Navbar selections with backend profile
  $('watsonxModelSelect')?.addEventListener('change', async function() {
    state.userProfile.selected_model = this.value;
    await saveProfile();
  });

  $('languageSelect')?.addEventListener('change', async function() {
    state.userProfile.preferred_language = this.value;
    await saveProfile();
  });

  $('profileBudgetFriendly')?.addEventListener('change', async function() {
    state.userProfile.budget_friendly = this.checked;
    await saveProfile();
  });

  // Weight Logging button binding
  $('logWeightBtn')?.addEventListener('click', logTodayWeight);

  // Redraw chart on theme toggle to adjust label colors
  $('themeToggle')?.addEventListener('click', () => {
    setTimeout(renderWeightChart, 150);
  });
});
