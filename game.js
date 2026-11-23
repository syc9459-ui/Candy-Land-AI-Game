import { joinRoom, roles } from 'https://esm.run/trystero';

const $ = id => document.getElementById(id);
const colors = ['#ffcae5','#c9f4e4','#ffecb5','#d9d0ff','#bde8ff','#ffd8c2'];\nconst treats = ['🍭','🍬','🍫','🍩','🍪','🧁','🍓','🍒','🍦','🍡','🍰','🍉','🍬','🍭','🍫','🍩','🍪','🧁','🍓','🍒','🍦','🍡','🍰','🍉','🍭','🍬','🍫','🍩','🍪','🏰'];
const colors = ['#ffcae5','#c9f4e4','#ffecb5','#d9d0ff','#bde8ff','#ffd8c2'];
let avatar='🐰', myId='', myProfile, gameState, room, isHost=false, roomId='', hostId='', rolling=false;

document.querySelectorAll('.avatar').forEach(btn=>btn.addEventListener('click',()=>{
  avatar=btn.dataset.avatar;
  document.querySelectorAll('.avatar').forEach(b=>b.classList.toggle('selected',b===btn));
}));

function randomCode(){return 'SWEET-'+Math.random().toString(36).slice(2,6).toUpperCase();}
function show(section){['setup','lobby','game'].forEach(id=>$(id).classList.toggle('hidden',id!==section));}
function name(){return $('name').value.trim()||'Candy Explorer';}
function setStatus(text){$('connection').textContent=text;}
function profiles(){return myProfile?.getAll()||{};}
function sortedPlayers(){return Object.entries(profiles()).map(([id,p])=>({id,...p}));}
function updateLobby(){
  const list=sortedPlayers();
  $('player-count').textContent=`(${list.length}/4)`;
  $('player-list').innerHTML=list.map(p=>`<div class="player-card ${p.id===hostId?'host':''}"><div class="piece">${escapeHtml(p.avatar||'🍬')}</div><strong>${escapeHtml(p.name||'Player')}</strong>${p.id===myId?' (you)':''}</div>`).join('');
  $('lobby-note').textContent=list.length<2?'Waiting for friends to join…':'Everyone is here! Host can start when ready.';
  $('start-game').classList.toggle('hidden',!isHost);
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function inviteUrl(){
  const u=new URL(location.href);u.search='';u.hash='';
  u.searchParams.set('room',roomId);
  return u.toString();
}
async function connect(code,host){
  isHost=host;
  $('connection').textContent='Connecting…';
  // Host-admin room: guests are invited by the roomId returned by getSelf().
  room=joinRoom({appId:'candy-land-online.game',maxUsers:4,use:[host?roles({selfAsAdmin:true}):roles()]},code);
  const self=await room.getSelf();myId=self.userId;roomId=self.roomId;
  hostId=host?myId:roomId.slice(roomId.lastIndexOf('~')+1);
  myProfile=room.makeUserState('player',{name:name(),avatar,joinedAt:Date.now()});
  myProfile.set({name:name(),avatar,joinedAt:Date.now()});
  gameState=room.makeState('game',{started:false,hostId,turnOrder:[],positions:{},turn:0,lastRoll:null,winner:null});
  const rollRequest=room.makeAction('roll-request');
  rollRequest.onMessage((payload,{userId})=>{
    if(!isHost||!gameState)return;
    processRoll(userId);
  });
  room.onUserJoin(()=>{updateLobby();if(isHost)syncPlayers();});
  room.onUserLeave(()=>{updateLobby();if(isHost)syncPlayers();});
  myProfile.onChange(updateLobby);
  gameState.onChange(renderGame);
  room.onError(err=>setStatus('Connection issue: '+(err?.message||err?.code||'retrying')));
  setStatus('Connected to room');
  $('room-label').textContent='Room: '+(roomId.split('~')[0]);
  $('invite-link').value=inviteUrl();
  updateLobby();
  show('lobby');
  if(host){
    gameState.set({started:false,hostId,turnOrder:[myId],positions:{[myId]:0},turn:0,lastRoll:null,winner:null});
  }
  renderGame(gameState.get());
}
function syncPlayers(){
  if(!isHost||!gameState)return;
  const current=gameState.get();
  const players=sortedPlayers().map(p=>p.id);
  if(!current.started){
    gameState.set({...current,turnOrder:players,positions:Object.fromEntries(players.map(id=>[id,current.positions?.[id]??0]))});
  }else{
    // Players who join mid-game are spectators; preserve the active race.
  }
}
let hostRolling=false;
async function processRoll(userId){
  const state=gameState.get();
  if(hostRolling||!state.started||state.winner||state.turnOrder[state.turn]!==userId)return;
  hostRolling=true;
  const roll=Math.floor(Math.random()*6)+1;
  const target=Math.min((state.positions[userId]||0)+roll,29);
  gameState.set({...state,lastRoll:{userId,roll,at:Date.now()}});
  // Animate one space at a time by broadcasting each step to everyone.
  for(let step=(state.positions[userId]||0)+1;step<=target;step++){
    await new Promise(resolve=>setTimeout(resolve,260));
    const latest=gameState.get();
    gameState.set({...latest,positions:{...latest.positions,[userId]:step}});
  }
  const latest=gameState.get();
  const winner=target===29?userId:null;
  gameState.set({...latest,turn:winner?latest.turn:(latest.turn+1)%latest.turnOrder.length,winner});
  hostRolling=false;
}
$('create').onclick=async()=>{
  $('create').disabled=true;
  try{await connect(randomCode(),true);$('invite-link').value=inviteUrl();}
  catch(e){alert('Could not create room: '+e.message);$('create').disabled=false;}
};
$('join').onclick=async()=>{
  const code=$('room-code').value.trim()||new URL(location.href).searchParams.get('room');
  if(!code){alert('Enter a room code or open your invite link.');return;}
  $('join').disabled=true;
  try{await connect(code,false);}
  catch(e){alert('Could not join room: '+e.message);$('join').disabled=false;}
};
const invite=new URL(location.href).searchParams.get('room');
if(invite){$('room-code').value=invite;}

$('copy').onclick=async()=>{
  try{await navigator.clipboard.writeText(inviteUrl());$('copy').textContent='Copied!';}
  catch{$('invite-link').select();document.execCommand('copy');$('copy').textContent='Copied!';}
};
$('start-game').onclick=()=>{
  if(!isHost)return;
  const players=sortedPlayers().map(p=>p.id);
  if(players.length<2){alert('Invite at least one friend first!');return;}
  gameState.set({started:true,hostId,turnOrder:players,positions:Object.fromEntries(players.map(id=>[id,0])),turn:0,lastRoll:null,winner:null});
};
$('roll').onclick=()=>{
  if(!gameState||rolling)return;
  const state=gameState.get();
  if(state.winner||state.turnOrder[state.turn]!==myId)return;
  rolling=true;$('roll').disabled=true;$('roll-text').textContent='Rolling…';
  if(isHost)processRoll(myId);else room.makeAction('roll-request').send({request:true});
  setTimeout(()=>{rolling=false;renderGame(gameState.get());},1700);
};
function renderGame(state){
  if(!state)return;
  if(state.started)show('game');
  if(!state.started)return;
  const list=sortedPlayers();
  const currentId=state.turnOrder[state.turn];
  const current=list.find(p=>p.id===currentId);
  $('turn-text').textContent=state.winner?'Game finished!':`It's ${current?.name||'a player'}'s turn ${currentId===myId?'— your turn!':''}`;
  $('roll').disabled=state.winner||currentId!==myId||rolling;
  $('roll').textContent=currentId===myId?'ROLL 🎲':'Waiting for turn';
  if(state.lastRoll){
    const player=list.find(p=>p.id===state.lastRoll.userId);
    $('dice').textContent=['⚀','⚁','⚂','⚃','⚄','⚅'][state.lastRoll.roll-1];
    $('roll-text').textContent=`${player?.name||'Player'} rolled ${state.lastRoll.roll}!`;
  }
  renderBoard(state,list);
  if(state.winner){
    const winner=list.find(p=>p.id===state.winner);
    $('winner-title').textContent=`${winner?.avatar||'🍭'} ${winner?.name||'Player'} wins!`;
    $('winner-text').textContent='Congratulations! They reached the Candy Castle!';
    $('winner').classList.remove('hidden');
  }
}
function renderBoard(state,list){
  $('board').innerHTML='';
  treats.forEach((sweet,index)=>{
    const cell=document.createElement('div');
    cell.className='space';
    cell.style.setProperty('--space',colors[index%colors.length]);
    cell.innerHTML=`<span class="space-number">${index+1}</span><span>${sweet}</span>`;
    const pieces=list.filter(p=>state.positions?.[p.id]===index);
    if(pieces.length){
      const holder=document.createElement('div');holder.className='pieces';
      pieces.forEach(p=>{const piece=document.createElement('span');piece.className='piece';piece.title=p.name;piece.textContent=p.avatar||'🍬';holder.appendChild(piece);});
      cell.appendChild(holder);
      cell.classList.add('current');
    }
    $('board').appendChild(cell);
  });
}
$('leave').onclick=$('leave-game').onclick=async()=>{
  if(room)await room.leave();
  location.href=location.pathname;
};

// Keep room state synchronized; Trystero uses peer-to-peer WebRTC with public signaling relays.
