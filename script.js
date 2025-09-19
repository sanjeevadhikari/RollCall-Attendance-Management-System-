// ------------------------------
// Improved RollCall single-file
// ------------------------------
const DB_KEY = 'rollcall_v4_db';
let db = loadDB();

function loadDB(){
  const raw = localStorage.getItem(DB_KEY);
  if(raw) return JSON.parse(raw);
  const init = { users:[], classes:[], attendance:[] };
  localStorage.setItem(DB_KEY, JSON.stringify(init));
  return init;
}
function saveDB(){ localStorage.setItem(DB_KEY, JSON.stringify(db)); }

async function hashPassword(pw){
  const enc = new TextEncoder().encode(pw);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function uid(prefix='id'){ return prefix + '_' + Math.random().toString(36).slice(2,9); }
function todayISO(d=new Date()){ const y=d.getFullYear(); const m=('0'+(d.getMonth()+1)).slice(-2); const day=('0'+d.getDate()).slice(-2); return `${y}-${m}-${day}`; }
function $(s){ return document.querySelector(s); }
function $all(s){ return Array.from(document.querySelectorAll(s)); }

// State
let currentUser = null;
let activeRoleTab = 'teacher';
let calYear = (new Date()).getFullYear();
let calMonth = (new Date()).getMonth();
let stuChart = null;
let classChart = null;
let currentChartClassId = null;

// Student sorting functionality
let currentSort = 'name-asc';
let currentClassTab = 'all';

// UI helpers
function showStep(id){ document.querySelectorAll('.step').forEach(s=>s.classList.remove('active')); const el=document.getElementById(id); if(el) el.classList.add('active'); updateHeader(); }
function updateHeader(){ if(currentUser){ const u=db.users.find(x=>x.id===currentUser.id); if(u) { $('#userStatus').innerText = `${u.name || u.email} (${currentUser.role})`; $('#btnSignOut').classList.remove('hidden'); } } else { $('#userStatus').innerText='Not signed in'; $('#btnSignOut').classList.add('hidden'); } }

// Ensure demo accounts exist on load (fixes "Teacher not found")
(async function ensureDemoOnLoad(){
  // Create default classes if missing
  if(!db.classes.length){
    db.classes.push({ id: uid('c'), name: '10A' }, { id: uid('c'), name: '10B' });
  }
  // Teacher
  if(!db.users.some(u=>u.role==='teacher' && u.email==='ms@example.com')){
    const hashedPassword = await hashPassword('teach123');
    db.users.push({ id: uid('u'), role:'teacher', name:'Ms Sharma', email:'ms@example.com', passwordHash: hashedPassword });
  }
  // Students - Indian names
  const clsA = db.classes[0].id;
  const clsB = db.classes[1].id;
  
  // Indian student names
  const indianStudents = [
    { name: 'Aarav Sharma', roll: 'A01', classId: clsA },
    { name: 'Aditi Patel', roll: 'A02', classId: clsA },
    { name: 'Rohan Singh', roll: 'A03', classId: clsA },
    { name: 'Priya Kumar', roll: 'A04', classId: clsA },
    { name: 'Vikram Gupta', roll: 'A05', classId: clsA },
    { name: 'Ananya Reddy', roll: 'B01', classId: clsB },
    { name: 'Rahul Mehta', roll: 'B02', classId: clsB },
    { name: 'Sneha Joshi', roll: 'B03', classId: clsB },
    { name: 'Arjun Malhotra', roll: 'B04', classId: clsB },
    { name: 'Divya Iyer', roll: 'B05', classId: clsB }
  ];

  // Create students if they don't exist
  for (const student of indianStudents) {
    if(!db.users.some(u=>u.role==='student' && u.roll===student.roll)){
      const hashedPassword = await hashPassword('pass123');
      db.users.push({ 
        id: uid('s'), 
        role:'student', 
        name: student.name, 
        roll: student.roll, 
        classId: student.classId, 
        passwordHash: hashedPassword, 
        parentCode: 'pc_' + student.roll 
      });
    }
  }
  
  // Generate attendance data for the past 30 days
  const today = new Date();
  for(let i = 30; i >= 1; i--){
    const d = new Date();
    d.setDate(today.getDate() - i);
    const iso = todayISO(d);
    
    // Skip weekends (Saturday=6, Sunday=0)
    if(d.getDay() !== 0 && d.getDay() !== 6) {
      db.users.filter(u=>u.role==='student').forEach((s, idx)=>{
        if(!db.attendance.some(a=>a.studentId===s.id && a.date===iso)){
          // Make attendance somewhat realistic (90% present)
          const status = (Math.random() > 0.1) ? 'PRESENT' : 'ABSENT';
          db.attendance.push({ 
            id: uid('att'), 
            studentId: s.id, 
            date: iso, 
            status, 
            recordedBy: db.users.find(x=>x.role==='teacher')?.id || null 
          });
        }
      });
    }
  }
  saveDB();
})();

// Wiring top-level buttons
$('#gotoLogin').addEventListener('click', ()=> { showLogin(); });
$('#seedQuick').addEventListener('click', async ()=> { await ensureDemoOnLoad(); alert('Demo ensured/seeded'); renderLoginCard(activeRoleTab); });
$('#backHome').addEventListener('click', ()=> showStep('step-landing'));
$('#seedBtnHeader').addEventListener('click', async ()=> { await ensureDemoOnLoad(); alert('Demo ensured/seeded'); renderTeacherDashboard(); });

$('#btnSignOut').addEventListener('click', ()=>{ currentUser=null; localStorage.removeItem('rollcall_session_v4'); updateHeader(); showLogin(); });

// Parent sign out
$('#parentSignOut').addEventListener('click', ()=>{ 
  showLogin(); 
});

// role tabs
$all('.role-tab').forEach(bt=>{
  bt.addEventListener('click', ()=>{
    $all('.role-tab').forEach(x=>x.classList.remove('bg-indigo-50','text-indigo-700'));
    bt.classList.add('bg-indigo-50','text-indigo-700');
    activeRoleTab = bt.dataset.role;
    renderLoginCard(activeRoleTab);
  });
});
// default highlight teacher
const defaultTab = $all('.role-tab').find(x=>x.dataset.role==='teacher'); if(defaultTab) { defaultTab.classList.add('bg-indigo-50','text-indigo-700'); }

function showLogin(){ showStep('step-login'); renderLoginCard(activeRoleTab); }

// Render login form area dynamically
function renderLoginCard(role){
  const area = $('#loginArea'); area.innerHTML = '';
  const container = document.createElement('div'); container.className = 'p-3';
  const message = document.createElement('div'); message.id = 'loginMsg'; message.className = 'small-muted mb-2';
  container.appendChild(message);

  const form = document.createElement('form'); form.className = 'space-y-3';
  form.onsubmit = async (e)=>{ e.preventDefault(); await handleLogin(role); };

  if(role === 'teacher'){
    form.innerHTML = `
      <label class="text-sm">Email</label><input id="loginEmail" class="input w-full" type="email" placeholder="e.g. ms@example.com" required />
      <label class="text-sm">Password</label><div class="flex gap-2"><input id="loginPassword" type="password" class="input w-full" required /><button type="button" id="toggleTeacherPw" class="btn">Show</button></div>
      <div class="flex gap-2"><button class="btn btn-primary">Sign in</button><button type="button" id="signupTeacher" class="btn">Sign up</button></div>
    `;
  } else if(role === 'student'){
    form.innerHTML = `
      <label class="text-sm">Roll</label><input id="loginRoll" class="input w-full" placeholder="e.g. A01" required />
      <label class="text-sm">Password</label><div class="flex gap-2"><input id="loginPassword" type="password" class="input w-full" required /><button type="button" id="toggleStudentPw" class="btn">Show</button></div>
      <div class="flex gap-2"><button class="btn btn-primary">Sign in</button><button type="button" id="signupStudent" class="btn">Sign up</button></div>
    `;
  } else {
    form.innerHTML = `
      <label class="text-sm">Parent code</label><input id="loginParentCode" class="input w-full" placeholder="e.g. pc_A01" required />
      <div class="flex gap-2"><button class="btn btn-primary">Access</button></div>
    `;
  }

  container.appendChild(form);
  area.appendChild(container);

  // Bind toggles and signups
  $('#toggleTeacherPw')?.addEventListener('click', ()=>{ togglePw('#loginPassword'); });
  $('#toggleStudentPw')?.addEventListener('click', ()=>{ togglePw('#loginPassword'); });

  $('#signupTeacher')?.addEventListener('click', ()=> renderSignup('teacher'));
  $('#signupStudent')?.addEventListener('click', ()=> renderSignup('student'));
}

function togglePw(sel){
  const el = document.querySelector(sel);
  if(!el) return;
  if(el.type === 'password') el.type = 'text'; else el.type = 'password';
}

// Signup render
function renderSignup(role, prefill={}){
  const area = $('#loginArea'); area.innerHTML = '';
  const container = document.createElement('div'); container.className='p-3';
  const form = document.createElement('form'); form.className='space-y-3';
  form.onsubmit = async (e)=>{ e.preventDefault(); await handleSignup(role); };

  if(role==='teacher'){
    form.innerHTML = `
      <label class="text-sm">Full name</label><input id="signupName" class="input w-full" required />
      <label class="text-sm">Email</label><input id="signupEmail" class="input w-full" type="email" required />
      <label class="text-sm">Password</label><input id="signupPassword" class="input w-full" type="password" required />
      <div class="flex gap-2"><button class="btn btn-primary">Create Teacher</button><button type="button" id="cancelSignup" class="btn">Cancel</button></div>
    `;
  } else {
    // student
    const opts = db.classes.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
    form.innerHTML = `
      <label class="text-sm">Full name</label><input id="signupName" class="input w-full" required />
      <label class="text-sm">Roll</label><input id="signupRoll" class="input w-full" required />
      <label class="text-sm">Password</label><input id="signupPassword" class="input w-full" type="password" required />
      <label class="text-sm">Class</label><select id="signupClass" class="input w-full">${opts}</select>
      <div class="flex gap-2"><button class="btn btn-primary">Create Student</button><button type="button" id="cancelSignup" class="btn">Cancel</button></div>
    `;
  }
  container.appendChild(form); area.appendChild(container);
  $('#cancelSignup').addEventListener('click', ()=> renderLoginCard(activeRoleTab) );
  // prefill if any
  if(prefill.email) $('#signupEmail').value = prefill.email;
  if(prefill.roll) $('#signupRoll').value = prefill.roll;
}

// handle signup
async function handleSignup(role){
  if(role==='teacher'){
    const name = $('#signupName').value.trim(); const email = $('#signupEmail').value.trim().toLowerCase(); const pw = $('#signupPassword').value;
    if(!name||!email||!pw) return alert('Fill all fields');
    if(db.users.some(u=>u.role==='teacher' && u.email===email)) return alert('Teacher exists');
    const ph = await hashPassword(pw);
    db.users.push({ id: uid('u'), role:'teacher', name, email, passwordHash: ph }); saveDB();
    alert('Teacher account created — you can sign in now');
    renderLoginCard('teacher');
  } else {
    const name = $('#signupName').value.trim(); const roll = $('#signupRoll').value.trim(); const pw = $('#signupPassword').value; const classId = $('#signupClass').value;
    if(!name||!roll||!pw||!classId) return alert('Fill all fields');
    if(db.users.some(u=>u.role==='student' && u.roll===roll)) return alert('Roll exists');
    const ph = await hashPassword(pw);
    db.users.push({ id: uid('s'), role:'student', name, roll, classId, passwordHash: ph, parentCode: 'pc_'+roll }); saveDB();
    alert('Student account created — you can sign in now');
    renderLoginCard('student');
  }
}

// handle login with friendlier behavior if missing
async function handleLogin(role){
  if(role==='teacher'){
    const email = $('#loginEmail').value.trim().toLowerCase(); const pw = $('#loginPassword').value;
    if(!email||!pw) return setLoginMessage('Enter email & password', true);
    const user = db.users.find(u=>u.role==='teacher' && u.email===email);
    if(!user){
      // show create teacher prompt
      setLoginMessage('Teacher not found. Want to create an account?', true, { action: 'create-teacher', email });
      return;
    }
    const ph = await hashPassword(pw);
    if(user.passwordHash !== ph) return setLoginMessage('Password incorrect', true);
    currentUser = { id: user.id, role:'teacher' }; await onSignIn();
  } else if(role==='student'){
    const roll = $('#loginRoll').value.trim(); const pw = $('#loginPassword').value;
    if(!roll||!pw) return setLoginMessage('Enter roll & password', true);
    const user = db.users.find(u=>u.role==='student' && u.roll===roll);
    if(!user){
      setLoginMessage('Student not found. Create account?', true, { action:'create-student', roll });
      return;
    }
    const ph = await hashPassword(pw);
    if(user.passwordHash !== ph) return setLoginMessage('Password incorrect', true);
    currentUser = { id: user.id, role:'student' }; await onSignIn();
  } else {
    const code = $('#loginParentCode').value.trim();
    if(!code) return setLoginMessage('Enter parent code', true);
    const student = db.users.find(u=>u.role==='student' && u.parentCode===code);
    if(!student) return setLoginMessage('Parent code not found', true);
    // show parent view
    showParentResult(student.roll, code);
  }
}

function setLoginMessage(txt, isError=false, extra){
  const el = $('#loginMsg'); el.innerText = txt; el.className = isError ? 'error' : 'ok';
  // attach action link if provided
  if(extra){
    const a = document.createElement('div'); a.className='mt-2';
    if(extra.action === 'create-teacher'){
      const btn = document.createElement('button'); btn.className='btn'; btn.innerText = 'Create teacher';
      btn.addEventListener('click', ()=> renderSignup('teacher', { email: extra.email }));
      a.appendChild(btn);
    } else if(extra.action === 'create-student'){
      const btn = document.createElement('button'); btn.className='btn'; btn.innerText = 'Create student';
      btn.addEventListener('click', ()=> renderSignup('student', { roll: extra.roll }));
      a.appendChild(btn);
    }
    el.appendChild(a);
  }
  // clear message automatically after 6s
  setTimeout(()=>{ if(el) { el.innerText=''; el.className='small-muted'; } }, 6000);
}

// on sign in: persist session & route
async function onSignIn(){
  localStorage.setItem('rollcall_session_v4', JSON.stringify({ userId: currentUser.id }));
  updateHeader();
  if(currentUser.role === 'teacher'){ renderTeacherDashboard(); showStep('step-teacher'); }
  else { renderStudentDashboard(); showStep('step-student'); }
}

// Reset demo (wipe and reseed defaults)
$('#resetDemo').addEventListener('click', async ()=>{
  if(!confirm('Reset demo data? This will remove current data and restore demo.')) return;
  localStorage.removeItem(DB_KEY);
  db = loadDB();
  await ensureDemoOnLoad();
  alert('Demo reset. Use ms@example.com / teach123 for teacher, A01 / pass123 for student, pc_A01 for parent');
  renderLoginCard(activeRoleTab);
});

// -------------------------
// Teacher dashboard logic
// -------------------------
function renderTeacherDashboard(){
  const u = db.users.find(x=>x.id===currentUser.id);
  if(!u) return alert('User not found');
  $('#teacherName').innerText = u.name;
  $('#teacherEmail').innerText = u.email || '';
  // populate class selects
  const attClass = $('#attClass'); attClass.innerHTML='';
  const newStuClass = $('#newStuClass'); newStuClass.innerHTML='';
  const chartClassSelect = $('#chartClassSelect'); chartClassSelect.innerHTML='';
  
  db.classes.forEach(c=>{ 
    const o=document.createElement('option'); o.value=c.id; o.textContent=c.name; 
    attClass.appendChild(o); 
    newStuClass.appendChild(o.cloneNode(true));
    chartClassSelect.appendChild(o.cloneNode(true));
  });
  
  $('#totalClasses').innerText = db.classes.length;
  $('#totalStudents').innerText = db.users.filter(x=>x.role==='student').length;

  // render list for selected class
  if(db.classes.length) {
    const selectedClassId = attClass.value || db.classes[0].id;
    renderAttendanceListForClass(selectedClassId, $('#attDate').value || todayISO());
    
    // Set chart class to first class if not set
    if (!currentChartClassId) {
      currentChartClassId = selectedClassId;
      chartClassSelect.value = currentChartClassId;
    }
    renderClassChart(currentChartClassId);
  }

  // students list with class tabs and sorting
  renderClassTabs();
  renderAllStudents();

  // bind forms
  $('#attDate').value = todayISO();
  $('#listDate').value = todayISO();
  $('#addClassForm').onsubmit = function(e){ e.preventDefault(); const name = $('#newClassName').value.trim(); if(!name) return alert('Enter class name'); db.classes.push({ id: uid('c'), name }); saveDB(); $('#newClassName').value=''; renderTeacherDashboard(); };
  $('#addStudentForm').onsubmit = async function(e){ e.preventDefault(); const name = $('#newStuName').value.trim(); const roll = $('#newStuRoll').value.trim(); const pw = $('#newStuPassword').value; const classId = $('#newStuClass').value; if(!name||!roll||!pw||!classId) return alert('Complete fields'); if(db.users.some(x=>x.role==='student'&&x.roll===roll)) return alert('Roll exists'); const ph = await hashPassword(pw); db.users.push({ id: uid('s'), role:'student', name, roll, classId, passwordHash:ph, parentCode:'pc_'+roll }); saveDB(); $('#newStuName').value=''; $('#newStuRoll').value=''; $('#newStuPassword').value=''; renderTeacherDashboard(); alert('Student added'); };

  $('#attForm').onsubmit = function(e){ e.preventDefault(); saveAttendance(); };
  $('#clearClassAttend').onclick = function(){ if(!confirm('Clear attendance for this class & date?')) return; const cls = $('#attClass').value; const date = $('#attDate').value || todayISO(); db.attendance = db.attendance.filter(a=>!(a.date===date && db.users.find(u=>u.id===a.studentId && u.classId===cls))); saveDB(); renderTeacherDashboard(); alert('Cleared'); };
  $('#exportAllBtn').onclick = exportAllCSV;
  $('#exportStudentsBtn').onclick = exportAllCSV;
  $('#exportClassCSV').onclick = exportAttendanceCSVForSelectedClass;
  $('#importCSVBtn').onclick = ()=> $('#importCSV').click();
  $('#importCSV').onchange = async function(e){ const f = e.target.files[0]; if(!f) return; const text = await f.text(); parseImportedCSV(text); };

  // View toggle functionality
  $('#viewToggle').addEventListener('change', toggleView);
  $('#chartClassSelect').addEventListener('change', function() {
    currentChartClassId = this.value;
    if ($('#viewToggle').checked) {
      renderAttendanceListForSelectedClassAndDate();
    } else {
      renderClassChart(currentChartClassId);
    }
  });
  $('#listDate').addEventListener('change', renderAttendanceListForSelectedClassAndDate);
  
  // Sorting functionality
  $('#sortStudents').addEventListener('change', function() {
    currentSort = this.value;
    renderAllStudents();
  });
}

function renderClassTabs() {
  const tabsContainer = $('#classTabs');
  tabsContainer.innerHTML = '';
  
  // Add "All Classes" tab
  const allTab = document.createElement('div');
  allTab.className = `class-tab ${currentClassTab === 'all' ? 'active' : ''}`;
  allTab.textContent = 'All Classes';
  allTab.dataset.classId = 'all';
  allTab.addEventListener('click', () => {
    currentClassTab = 'all';
    $all('.class-tab').forEach(t => t.classList.remove('active'));
    allTab.classList.add('active');
    renderAllStudents();
  });
  tabsContainer.appendChild(allTab);
  
  // Add tabs for each class
  db.classes.forEach(c => {
    const tab = document.createElement('div');
    tab.className = `class-tab ${currentClassTab === c.id ? 'active' : ''}`;
    tab.textContent = c.name;
    tab.dataset.classId = c.id;
    tab.addEventListener('click', () => {
      currentClassTab = c.id;
      $all('.class-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderAllStudents();
    });
    tabsContainer.appendChild(tab);
  });
}

function renderAllStudents(){
  const el = $('#allStudents'); el.innerHTML='';
  let studs = db.users.filter(u=>u.role==='student');
  
  // Filter by selected class
  if (currentClassTab !== 'all') {
    studs = studs.filter(s => s.classId === currentClassTab);
  }
  
  // Apply sorting
  studs = sortStudents(studs, currentSort);
  
  if(!studs.length) { 
    el.innerHTML = '<div class="small-muted p-4 text-center">No students found</div>'; 
    return; 
  }
  
  // Show class header if viewing all classes
  if (currentClassTab === 'all') {
    studs.forEach(s=>{
      // Check if we need to add a class header
      const prevStudent = studs[studs.indexOf(s) - 1];
      if (!prevStudent || prevStudent.classId !== s.classId) {
        const className = db.classes.find(c => c.id === s.classId)?.name || 'Unknown Class';
        const header = document.createElement('div');
        header.className = 'p-2 bg-gray-100 rounded-t-lg font-semibold mt-3';
        header.textContent = className;
        el.appendChild(header);
      }
      
      const row = document.createElement('div'); 
      row.className='p-2 bg-white border-b flex items-center justify-between';
      row.innerHTML = `<div><div class="font-medium">${s.name}</div><div class="text-xs small-muted">${db.classes.find(c=>c.id===s.classId)?.name||'—'} — ${s.roll}</div></div><div class="font-semibold">${attendancePercentage(s.id)}%</div>`;
      el.appendChild(row);
    });
  } else {
    // Just show students without class headers
    studs.forEach(s=>{
      const row = document.createElement('div'); 
      row.className='p-2 bg-white rounded mb-2 flex items-center justify-between';
      row.innerHTML = `<div><div class="font-medium">${s.name}</div><div class="text-xs small-muted">${db.classes.find(c=>c.id===s.classId)?.name||'—'} — ${s.roll}</div></div><div class="font-semibold">${attendancePercentage(s.id)}%</div>`;
      el.appendChild(row);
    });
  }
}

// Sorting function
function sortStudents(students, sortBy) {
  return [...students].sort((a, b) => {
    switch(sortBy) {
      case 'name-asc':
        return a.name.localeCompare(b.name);
      case 'name-desc':
        return b.name.localeCompare(a.name);
      case 'roll-asc':
        return a.roll.localeCompare(b.roll);
      case 'roll-desc':
        return b.roll.localeCompare(a.roll);
      case 'attendance-asc':
        return attendancePercentage(a.id) - attendancePercentage(b.id);
      case 'attendance-desc':
        return attendancePercentage(b.id) - attendancePercentage(a.id);
      default:
        return 0;
    }
  });
}

function toggleView() {
  const isListView = $('#viewToggle').checked;
  if (isListView) {
    $('#graphView').classList.remove('active');
    $('#listView').classList.add('active');
    renderAttendanceListForSelectedClassAndDate();
  } else {
    $('#listView').classList.remove('active');
    $('#graphView').classList.add('active');
    renderClassChart(currentChartClassId);
  }
}

function renderAttendanceListForSelectedClassAndDate() {
  const classId = $('#chartClassSelect').value;
  const date = $('#listDate').value || todayISO();
  renderAttendanceListForClassView(classId, date);
}

function renderAttendanceListForClassView(classId, date) {
  const container = $('#attendanceList'); 
  container.innerHTML = '';
  
  const studs = db.users.filter(u => u.role === 'student' && u.classId === classId);
  if (!studs.length) {
    container.innerHTML = '<div class="small-muted p-4 text-center">No students in this class</div>';
    return;
  }
  
  const classInfo = db.classes.find(c => c.id === classId);
  const header = document.createElement('div');
  header.className = 'flex justify-between items-center p-3 bg-gray-50 rounded-t-lg';
  header.innerHTML = `
    <div class="font-semibold">${classInfo?.name || 'Unknown Class'} - ${date}</div>
    <div class="text-sm">Total: ${studs.length} students</div>
  `;
  container.appendChild(header);
  
  studs.forEach(s => {
    const rec = db.attendance.find(a => a.studentId === s.id && a.date === date);
    const status = rec ? rec.status : 'Not Recorded';
    const statusColor = status === 'PRESENT' ? 'text-green-600' : status === 'ABSENT' ? 'text-red-600' : 'text-gray-500';
    
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between p-3 border-b';
    row.innerHTML = `
      <div>
        <div class="font-medium">${s.name}</div>
        <div class="text-xs small-muted">Roll: ${s.roll}</div>
      </div>
      <div class="${statusColor} font-semibold">${status}</div>
    `;
    container.appendChild(row);
  });
}

function renderAttendanceListForClass(classId, date){
  const container = $('#attList'); container.innerHTML='';
  const studs = db.users.filter(u=>u.role==='student' && u.classId===classId);
  if(!studs.length){ container.innerHTML = '<div class="small-muted">No students</div>'; return; }
  studs.forEach(s=>{
    const rec = db.attendance.find(a=>a.studentId===s.id && a.date===date);
    const div = document.createElement('div'); div.className='flex items-center justify-between p-2 border-b';
    div.innerHTML = `<div><div class="font-medium">${s.name}</div><div class="text-xs small-muted">Roll: ${s.roll}</div></div>`;
    const cb = document.createElement('input'); cb.type='checkbox'; cb.dataset.stu = s.id; cb.checked = !(rec && rec.status==='ABSENT');
    div.appendChild(cb); container.appendChild(div);
  });
}

function saveAttendance(){
  const cls = $('#attClass').value; const date = $('#attDate').value || todayISO();
  if(!cls||!date) return alert('Select class & date');
  const studs = db.users.filter(u=>u.role==='student' && u.classId===cls);
  studs.forEach(s=>{
    const cb = document.querySelector(`#attList input[data-stu="${s.id}"]`);
    const status = cb && cb.checked ? 'PRESENT' : 'ABSENT';
    const existing = db.attendance.find(a=>a.studentId===s.id && a.date===date);
    if(existing) existing.status = status; else db.attendance.push({ id: uid('att'), studentId: s.id, date, status, recordedBy: currentUser.id });
  });
  saveDB(); alert('Saved'); 
  renderTeacherDashboard();
}

function attendancePercentage(studentId){
  const recs = db.attendance.filter(a=>a.studentId===studentId);
  if(!recs.length) return 0;
  const present = recs.filter(r=>r.status==='PRESENT').length;
  return Math.round(present / recs.length * 100);
}

function renderClassChart(classId){
  const ctx = document.getElementById('classChart').getContext('2d');
  
  // Get students in the selected class
  const students = db.users.filter(u => u.role === 'student' && u.classId === classId);
  const labels = students.map(s => s.name);
  const data = students.map(s => attendancePercentage(s.id));
  
  if(classChart) classChart.destroy();
  
  // Get class name for title
  const className = db.classes.find(c => c.id === classId)?.name || 'Unknown Class';
  
  classChart = new Chart(ctx, { 
    type: 'bar', 
    data: { 
      labels, 
      datasets:[{
        label: `Attendance % - ${className}`, 
        data, 
        backgroundColor: 'rgba(79,70,229,0.28)',
        borderColor: 'rgba(79,70,229,1)',
        borderWidth: 1
      }] 
    }, 
    options: { 
      indexAxis: 'y', 
      responsive: true, 
      maintainAspectRatio: false, 
      plugins: {
        legend: {
          display: true,
          position: 'top'
        },
        title: {
          display: true,
          text: `Student Attendance - ${className}`
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          max: 100,
          title: {
            display: true,
            text: 'Attendance Percentage'
          }
        }
      }
    } 
  });
}

// CSV export/import
function downloadFile(name, content, mime='text/csv'){ const blob = new Blob([content], { type: mime + ';charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }

function exportAllCSV(){
  let csv = 'type,studentId,name,roll,classId,parentCode\n';
  db.users.filter(u=>u.role==='student').forEach(s=> csv += `student,${s.id},${s.name},${s.roll},${s.classId||''},${s.parentCode||''}\n`);
  csv += '\nattendanceId,studentId,date,status\n';
  db.attendance.forEach(a=> csv += `${a.id},${a.studentId},${a.date},${a.status}\n`);
  downloadFile('rollcall_export.csv', csv);
}

function exportAttendanceCSVForSelectedClass(){
  const cls = $('#attClass').value;
  if(!cls) return alert('Select class'); let csv = 'roll,name,date,status\n';
  db.attendance.filter(a=> db.users.some(s=>s.id===a.studentId && s.classId===cls)).forEach(a=>{
    const s = db.users.find(x=>x.id===a.studentId);
    csv += `${s.roll},${s.name},${a.date},${a.status}\n`;
  });
  downloadFile('class_attendance.csv', csv);
}

function parseImportedCSV(text){
  const lines = text.split('\n').map(l=>l.trim()).filter(Boolean);
  for(const line of lines){
    const cols = line.split(',');
    if(cols[0]==='student'){
      const [, sid, name, roll, classId, parentCode] = cols;
      if(!db.users.some(u=>u.role==='student' && u.roll===roll)) db.users.push({ id: sid||uid('s'), role:'student', name, roll, classId, parentCode });
    } else if(cols.length>=4 && cols[1]){
      const [aid, studentId, date, status] = cols;
      if(!db.attendance.some(a=>a.studentId===studentId && a.date===date)) db.attendance.push({ id: aid||uid('att'), studentId, date, status });
    }
  }
  saveDB(); alert('CSV imported'); renderTeacherDashboard();
}

$('#importCSV').addEventListener('change', async function(e){ const f = e.target.files[0]; if(!f) return; const t = await f.text(); parseImportedCSV(t); });

// -------------------------
// Student dashboard functions
// -------------------------
function renderStudentDashboard(){
  const u = db.users.find(x=>x.id===currentUser.id); if(!u) return alert('Student not found');
  $('#stuAvatar').innerText = (u.name||'S').split(' ').map(s=>s[0]).slice(0,2).join('');
  $('#stuName').innerText = u.name; $('#stuMeta').innerText = `${db.classes.find(c=>c.id===u.classId)?.name || '—'} — ${u.roll || '—'}`;
  const recs = db.attendance.filter(a=>a.studentId===u.id);
  $('#stuPresent').innerText = recs.filter(r=>r.status==='PRESENT').length;
  $('#stuAbsent').innerText = recs.filter(r=>r.status==='ABSENT').length;
  renderRecent(u.id); renderCalendarForStudent(u.id, calYear, calMonth); renderStudentChart(u.id);
  $('#exportStudentCSV').onclick = ()=> exportStudentCSV(u.id);
  $('#exportStudentPDF').onclick = ()=> exportStudentPDF(u.id);
}

function renderRecent(studentId){
  const rec = db.attendance.filter(a=>a.studentId===studentId).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8);
  const el = $('#recentList'); el.innerHTML='';
  if(!rec.length) el.innerHTML = '<div class="small-muted">No records</div>';
  rec.forEach(r=>{ const d = document.createElement('div'); d.className='py-1'; d.innerHTML = `<div class="font-medium">${r.date}</div><div class="text-xs small-muted">${r.status}</div>`; el.appendChild(d); });
}

function renderCalendarForStudent(studentId, year, month){
  const grid = $('#calGrid'); grid.innerHTML=''; const date = new Date(year, month, 1); const start = date.getDay(); const days = new Date(year, month+1, 0).getDate(); $('#calTitle').innerText = date.toLocaleString(undefined,{month:'long',year:'numeric'});
  // header
  const head = document.querySelector('.cal-head'); head.innerHTML=''; ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(dn=>{ const e = document.createElement('div'); e.className='text-center text-xs font-semibold'; e.innerText = dn; head.appendChild(e); });
  for(let i=0;i<start;i++){ const c = document.createElement('div'); c.className='cal-cell'; grid.appendChild(c); }
  for(let d=1; d<=days; d++){
    const iso = `${year}-${('0'+(month+1)).slice(-2)}-${('0'+d).slice(-2)}`;
    const rec = db.attendance.find(a=>a.studentId===studentId && a.date===iso);
    const cell = document.createElement('div'); cell.className='cal-cell';
    if(rec) cell.classList.add(rec.status==='ABSENT' ? 'bg-rose-50' : 'bg-emerald-50');
    if(iso===todayISO()) cell.classList.add('ring','ring-slate-200');
    cell.innerHTML = `<div class="font-semibold text-sm">${d}</div><div class="text-xs small-muted">${rec?rec.status:''}</div>`;
    grid.appendChild(cell);
  }
}

function prevMonth(){ calMonth--; if(calMonth<0){ calMonth=11; calYear--; } renderStudentDashboard(); }
function nextMonth(){ calMonth++; if(calMonth>11){ calMonth=0; calYear++; } renderStudentDashboard(); }

function renderStudentChart(studentId){
  const now = new Date(); const labels=[], present=[], absent=[];
  for(let i=5;i>=0;i--){ const d = new Date(now.getFullYear(), now.getMonth()-i, 1); labels.push(d.toLocaleString(undefined,{month:'short',year:'numeric'})); const monthStr = `${d.getFullYear()}-${('0'+(d.getMonth()+1)).slice(-2)}`; const recs = db.attendance.filter(a=>a.studentId===studentId && a.date.startsWith(monthStr)); present.push(recs.filter(r=>r.status==='PRESENT').length); absent.push(recs.filter(r=>r.status==='ABSENT').length); }
  const ctx = document.getElementById('stuChart').getContext('2d'); if(stuChart) stuChart.destroy();
  stuChart = new Chart(ctx, { type:'bar', data:{ labels, datasets:[{ label:'Present', data:present, backgroundColor:'rgba(16,185,129,0.2)' },{ label:'Absent', data:absent, backgroundColor:'rgba(244,63,94,0.12)' }] }, options:{ responsive:true, maintainAspectRatio:false } });
}

function exportStudentCSV(studentId){
  const s = db.users.find(u=>u.id===studentId); if(!s) return;
  let csv = 'date,status\n';
  db.attendance.filter(a=>a.studentId===studentId).sort((a,b)=>a.date.localeCompare(b.date)).forEach(r=> csv += `${r.date},${r.status}\n`);
  downloadFile(`${s.roll||s.name}_attendance.csv`, csv);
}

async function exportStudentPDF(studentId){
  const s = db.users.find(u=>u.id===studentId); if(!s) return;
  const recs = db.attendance.filter(a=>a.studentId===studentId).sort((a,b)=>a.date.localeCompare(b.date));
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(16); doc.text(`Attendance Report — ${s.name} (${s.roll||''})`, 14, 20);
  doc.setFontSize(11); doc.text(`Class: ${db.classes.find(c=>c.id===s.classId)?.name || ''}`, 14, 28);
  let y = 36; doc.setFontSize(10); doc.text('Date        Status', 14, y); y+=6;
  recs.forEach(r=>{ if(y>270){ doc.addPage(); y=20; } doc.text(`${r.date}    ${r.status}`, 14, y); y+=6; });
  doc.save(`${s.roll||s.name}_report.pdf`);
}

// Parent lookup
$('#parentLookup').addEventListener('click', ()=> {
  const roll = $('#parentRoll').value.trim(); const code = $('#parentCode').value.trim();
  if(!roll || !code) return alert('Enter both fields');
  showParentResult(roll, code);
});

function showParentResult(roll, code){
  const s = db.users.find(u=>u.role==='student' && u.roll===roll);
  if(!s) return alert('Student not found');
  if(s.parentCode !== code) return alert('Parent code mismatch');
  const recs = db.attendance.filter(a=>a.studentId===s.id);
  
  let html = `
    <div class="mt-3">
      <h4 class="font-medium">${s.name} — ${s.roll}</h4>
      <div class="small-muted">Class: ${db.classes.find(c=>c.id===s.classId)?.name || ''}</div>
      <div class="mt-2">Present: ${recs.filter(r=>r.status==='PRESENT').length} | Absent: ${recs.filter(r=>r.status==='ABSENT').length}</div>
      <div class="mt-2">
        <h5 class="font-medium">Recent Attendance:</h5>
        <ul class="list-disc pl-5 mt-2">
  `;
  
  recs.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10).forEach(r=> {
    const statusClass = r.status === 'PRESENT' ? 'text-green-600' : 'text-red-600';
    html += `<li>${r.date} — <span class="${statusClass}">${r.status}</span></li>`;
  });
  
  html += '</ul></div></div>';
  $('#parentResult').innerHTML = html;
  
  // Store student data for PDF export
  $('#parentResult').dataset.studentId = s.id;
  
  showStep('step-parent');
}

// Parent PDF export
$('#exportParentPDF').addEventListener('click', ()=> {
  const studentId = $('#parentResult').dataset.studentId;
  if (!studentId) return alert('No student data to export');
  exportParentPDF(studentId);
});

async function exportParentPDF(studentId) {
  const s = db.users.find(u=>u.id===studentId); 
  if(!s) return;
  
  const recs = db.attendance.filter(a=>a.studentId===studentId).sort((a,b)=>b.date.localeCompare(a.date));
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  // Title
  doc.setFontSize(18);
  doc.text(`Attendance Report for ${s.name}`, 14, 20);
  
  // Student details
  doc.setFontSize(12);
  doc.text(`Roll Number: ${s.roll}`, 14, 30);
  doc.text(`Class: ${db.classes.find(c=>c.id===s.classId)?.name || 'Unknown'}`, 14, 37);
  
  // Summary
  const presentCount = recs.filter(r=>r.status==='PRESENT').length;
  const absentCount = recs.filter(r=>r.status==='ABSENT').length;
  const total = presentCount + absentCount;
  const attendancePercent = total > 0 ? Math.round((presentCount / total) * 100) : 0;
  
  doc.text(`Total Present: ${presentCount}`, 14, 47);
  doc.text(`Total Absent: ${absentCount}`, 14, 54);
  doc.text(`Attendance Percentage: ${attendancePercent}%`, 14, 61);
  
  // Recent attendance records
  doc.setFontSize(14);
  doc.text('Recent Attendance Records:', 14, 73);
  
  let y = 80;
  doc.setFontSize(10);
  doc.text('Date', 14, y);
  doc.text('Status', 60, y);
  y += 7;
  
  recs.slice(0, 20).forEach(r=> {
    if(y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.text(r.date, 14, y);
    doc.text(r.status, 60, y);
    y += 6;
  });
  
  doc.save(`${s.name}_attendance_report.pdf`);
}

// Session restore
(function restoreSession(){
  const s = localStorage.getItem('rollcall_session_v4');
  if(s){
    try{
      const obj = JSON.parse(s);
      if(obj && obj.userId){
        const u = db.users.find(x=>x.id===obj.userId);
        if(u) { currentUser = { id: u.id, role: u.role }; updateHeader(); if(u.role==='teacher'){ renderTeacherDashboard(); showStep('step-teacher'); } else { renderStudentDashboard(); showStep('step-student'); } }
      }
    }catch(e){}
  }
})();

// initial display
updateHeader();
renderLoginCard('teacher');

// Helpers to wire class/date change
$('#attClass').addEventListener('change', ()=> renderAttendanceListForClass($('#attClass').value, $('#attDate').value || todayISO()) );
$('#attDate').addEventListener('change', ()=> renderAttendanceListForClass($('#attClass').value, $('#attDate').value || todayISO()) );