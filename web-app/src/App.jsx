import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BriefcaseBusiness, CalendarDays, Coffee, Copy, DoorOpen, House, LogOut,
  MessageCircle, Plus, Send, Settings2, ShieldCheck, Users, Wallet
} from 'lucide-react';
import { isSupabaseConfigured, supabase } from './lib/supabase.js';

const money = n => Math.floor(Math.max(0, Number(n) || 0)).toLocaleString('ko-KR') + '원';
export default function App() {
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState('home');
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hourly, setHourly] = useState(17290);
  const [workStart, setWorkStart] = useState('09:00');
  const [workEnd, setWorkEnd] = useState('18:00');
  const [breakMinutes, setBreakMinutes] = useState(60);
  const [overtimeRate, setOvertimeRate] = useState(1.5);
  const [nightRate, setNightRate] = useState(0.5);
  const [holidayRate, setHolidayRate] = useState(1.5);
  const [fixedAllowance, setFixedAllowance] = useState(0);
  const [status, setStatus] = useState('퇴근');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const todayKey = new Date().toLocaleDateString('en-CA');
  const elapsedKey = 'toesagak-elapsed:' + (session?.user?.id || 'guest') + ':' + todayKey;
  const [officeId, setOfficeId] = useState(null);
  const [officeName, setOfficeName] = useState('나의 오피스');
  const [inviteCode, setInviteCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [chatDraft, setChatDraft] = useState('');

  const notify = useCallback(message => {
    setToast(message);
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => setToast(''), 2800);
  }, []);

  useEffect(() => {
    if (!supabase) { setLoading(false); return undefined; }
    let alive = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (error) notify(error.message);
      setSession(data?.session || null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => { alive = false; subscription.unsubscribe(); };
  }, [notify]);

  useEffect(() => {
    try { setElapsedSeconds(Number(window.localStorage.getItem(elapsedKey) || 0)); }
    catch { setElapsedSeconds(0); }
  }, [elapsedKey]);

  useEffect(() => {
    if (['점심', '휴식', '퇴근', '휴일'].includes(status)) return undefined;
    const timer = window.setInterval(() => {
      setElapsedSeconds(previous => {
        const next = previous + 1;
        try { window.localStorage.setItem(elapsedKey, String(next)); } catch { /* Storage can be disabled. */ }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status, elapsedKey]);

  useEffect(() => {
    if (!session?.user || !supabase) return undefined;
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from('work_settings').select('*').eq('user_id', session.user.id).maybeSingle();
      if (!alive) return;
      if (error) { notify('근무 설정을 불러오지 못했어: ' + error.message); return; }
      if (!data) return;
      setHourly(data.hourly_wage);
      setWorkStart(String(data.work_start).slice(0, 5));
      setWorkEnd(String(data.work_end).slice(0, 5));
      setBreakMinutes(data.break_minutes);
      setOvertimeRate(Number(data.overtime_rate));
      setNightRate(Number(data.night_rate));
      setHolidayRate(Number(data.holiday_rate));
      setFixedAllowance(data.fixed_monthly_allowance);
    })();
    return () => { alive = false; };
  }, [session?.user?.id, notify]);

  const refreshOffice = useCallback(async id => {
    if (!id || !session?.user || !supabase) return;
    const { data: roster, error } = await supabase.from('office_members')
      .select('id,user_id,state,status_message,joined_at')
      .eq('office_id', id).order('joined_at', { ascending: true });
    if (error) { notify('오피스 정보 오류: ' + error.message); return; }
    const ids = [...new Set((roster || []).map(row => row.user_id))];
    const { data: profiles } = ids.length
      ? await supabase.from('profiles').select('id,display_name').in('id', ids)
      : { data: [] };
    const names = new Map((profiles || []).map(row => [row.id, row.display_name]));
    const mapped = (roster || []).map(row => ({
      ...row,
      name: row.user_id === session.user.id ? '나' : (names.get(row.user_id) || '퇴사각 유저'),
      mine: row.user_id === session.user.id
    }));
    setMembers(mapped);
    const mine = mapped.find(row => row.mine);
    if (mine) { setStatus(mine.state); setStatusMessage(mine.status_message || ''); }
    const { data: chats, error: chatError } = await supabase.from('office_messages')
      .select('id,user_id,body,created_at').eq('office_id', id)
      .order('created_at', { ascending: true }).limit(60);
    if (chatError) { notify('채팅을 불러오지 못했어: ' + chatError.message); return; }
    const senderIds = [...new Set((chats || []).map(row => row.user_id))];
    const { data: senders } = senderIds.length
      ? await supabase.from('profiles').select('id,display_name').in('id', senderIds)
      : { data: [] };
    const senderNames = new Map((senders || []).map(row => [row.id, row.display_name]));
    setMessages((chats || []).map(row => ({
      ...row,
      name: row.user_id === session.user.id ? '나' : (senderNames.get(row.user_id) || '동료'),
      mine: row.user_id === session.user.id
    })));
  }, [session?.user?.id, notify]);

  useEffect(() => {
    if (!session?.user || !supabase) {
      setOfficeId(null); setMembers([]); setMessages([]);
      return undefined;
    }
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from('office_members')
        .select('office_id').eq('user_id', session.user.id)
        .order('joined_at', { ascending: false }).limit(1).maybeSingle();
      if (!alive) return;
      if (error) { notify('오피스 확인 오류: ' + error.message); return; }
      if (!data) { setOfficeId(null); return; }
      const { data: office, error: officeError } = await supabase.from('offices')
        .select('id,name,invite_code').eq('id', data.office_id).single();
      if (!alive) return;
      if (officeError) { notify(officeError.message); return; }
      setOfficeId(office.id);
      setOfficeName(office.name);
      setInviteCode(office.invite_code || '');
    })();
    return () => { alive = false; };
  }, [session?.user?.id, notify]);

  useEffect(() => {
    if (!officeId || !session?.user || !supabase) return undefined;
    refreshOffice(officeId);
    const channel = supabase.channel('office-' + officeId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'office_members', filter: 'office_id=eq.' + officeId }, () => refreshOffice(officeId))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'office_messages', filter: 'office_id=eq.' + officeId }, () => refreshOffice(officeId))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [officeId, session?.user?.id, refreshOffice]);

  const paused = ['점심', '휴식', '퇴근', '휴일'].includes(status);
  const scheduledSeconds = useMemo(() => {
    const [sh, sm] = workStart.split(':').map(Number);
    const [eh, em] = workEnd.split(':').map(Number);
    let duration = (eh * 60 + em) - (sh * 60 + sm);
    if (duration < 0) duration += 1440;
    return Math.max(0, duration * 60 - Number(breakMinutes) * 60);
  }, [workStart, workEnd, breakMinutes]);
  const regularSeconds = Math.min(elapsedSeconds, scheduledSeconds);
  const overtimeSeconds = Math.max(0, elapsedSeconds - scheduledSeconds);
  const earned = (regularSeconds * hourly / 3600) + (overtimeSeconds * hourly / 3600 * Number(overtimeRate));
  const dailyExpected = scheduledSeconds * hourly / 3600;

  const sendMagicLink = async event => {
    event.preventDefault();
    if (!supabase || !email.trim()) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL, data: { display_name: email.split('@')[0] } }
    });
    setBusy(false);
    if (error) notify('로그인 링크 발송 실패: ' + error.message);
    else setEmailSent(true);
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) notify(error.message);
    else { setOfficeId(null); notify('로그아웃했어.'); }
  };

  const saveSettings = async event => {
    event.preventDefault();
    if (!session?.user) { notify('먼저 이메일로 로그인해줘.'); return; }
    setSaving(true);
    const { error } = await supabase.from('work_settings').upsert({
      user_id: session.user.id,
      hourly_wage: Number(hourly),
      work_start: workStart,
      work_end: workEnd,
      break_minutes: Number(breakMinutes),
      overtime_rate: Number(overtimeRate),
      night_rate: Number(nightRate),
      holiday_rate: Number(holidayRate),
      fixed_monthly_allowance: Number(fixedAllowance),
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    setSaving(false);
    notify(error ? '저장 실패: ' + error.message : '근무 설정을 저장했어.');
  };

  const createOffice = async () => {
    if (!session?.user) { notify('오피스 이용은 로그인 후 가능해.'); setTab('settings'); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('create_office', { p_name: officeName || '퇴사각 오피스' });
    setBusy(false);
    if (error) { notify('오피스 생성 실패: ' + error.message); return; }
    const row = Array.isArray(data) ? data[0] : data;
    setOfficeId(row.office_id); setInviteCode(row.invite_code);
    notify('오피스를 만들었어!');
  };

  const joinOffice = async event => {
    event.preventDefault();
    if (!session?.user) { notify('로그인 후 초대 코드를 사용할 수 있어.'); setTab('settings'); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('join_office_by_code', { p_invite_code: joinCode.trim() });
    setBusy(false);
    if (error) { notify('입장 실패: ' + error.message); return; }
    setOfficeId(data); setJoinCode('');
    const { data: office } = await supabase.from('offices').select('name,invite_code').eq('id', data).single();
    if (office) { setOfficeName(office.name); setInviteCode(office.invite_code || ''); }
    notify('오피스에 입장했어!');
  };

  const randomMatch = async () => {
    if (!session?.user) { notify('랜덤 매칭은 로그인 후 이용할 수 있어.'); setTab('settings'); return; }
    if (officeId) { notify('이미 오피스에 참여 중이야.'); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('find_random_office');
    setBusy(false);
    if (error) { notify('랜덤 매칭 실패: ' + error.message); return; }
    setOfficeId(data);
    const { data: office } = await supabase.from('offices').select('name,invite_code').eq('id', data).single();
    if (office) { setOfficeName(office.name); setInviteCode(office.invite_code || ''); }
    notify('랜덤 오피스에 연결했어!');
  };

  const changeStatus = async next => {
    setStatus(next);
    const mine = members.find(row => row.mine);
    if (mine) {
      const { error } = await supabase.from('office_members')
        .update({ state: next }).eq('id', mine.id);
      if (error) notify('상태 변경 실패: ' + error.message);
    }
  };

  const saveStatusMessage = async event => {
    event.preventDefault();
    const mine = members.find(row => row.mine);
    if (!mine) { notify('먼저 오피스에 입장해줘.'); return; }
    const { error } = await supabase.from('office_members')
      .update({ status_message: statusMessage.trim() }).eq('id', mine.id);
    notify(error ? error.message : '상태 메시지를 저장했어.');
  };

  const sendMessage = async event => {
    event.preventDefault();
    if (!officeId || !chatDraft.trim() || !session?.user) return;
    const { error } = await supabase.from('office_messages').insert({
      office_id: officeId, user_id: session.user.id, body: chatDraft.trim()
    });
    if (error) notify('메시지 전송 실패: ' + error.message);
    else setChatDraft('');
  };

  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(inviteCode); notify('초대 코드를 복사했어.'); }
    catch { notify('초대 코드: ' + inviteCode); }
  };

  if (loading) return <div className="loading-screen">퇴사각을 준비하고 있어…</div>;

  return <div className="app-shell">
    <div className="app-wrap">
      <header className="topbar">
        <div><div className="brand">퇴사각<span>·</span></div><p className="subbrand">일한 만큼, 실시간으로</p></div>
        <div className="user-chip">{session?.user?.email || '게스트 모드'}</div>
      </header>

      {!isSupabaseConfigured && <div className="config-warning">Supabase 연결 정보가 없어. web-app/.env.local을 설정해줘.</div>}

      {tab === 'home' && <main className="home-page">
        <div className="eyebrow">TODAY'S ACCRUED PAY</div>
        <section className="earn-card">
          <div className="earn-head"><span>지금까지 번 수당</span><span className={paused ? 'state paused' : 'state'}>{paused ? '일시 정지' : '● 적립 중'}</span></div>
          <div className="amount">{money(earned)}</div>
          <div className="rate">초당 <b>{money(hourly / 3600)}</b> · 누적 근무 {Math.floor(elapsedSeconds / 3600)}시간 {Math.floor((elapsedSeconds % 3600) / 60)}분</div>
          <div className="earn-foot"><span>기본 시급 {money(hourly)}</span><span>오늘 예상 {money(dailyExpected)}</span></div>
        </section>
        <div className="action-row">
          <button className="primary-action" onClick={() => changeStatus('근무')}><BriefcaseBusiness size={17}/>근무하기</button>
          <button onClick={() => changeStatus('점심')}><Coffee size={17}/>점심시간</button>
          <button onClick={() => changeStatus('퇴근')}><DoorOpen size={17}/>퇴근하기</button>
        </div>
        <section className="summary-grid">
          <article className="panel"><div className="panel-title"><CalendarDays size={16}/>이번 주 예상 수당</div><strong>{money(dailyExpected * 5)}</strong><small>주 5일 근무 기준 예상치</small></article>
          <article className="panel"><div className="panel-title"><Wallet size={16}/>월 고정 수당</div><strong>{money(fixedAllowance)}</strong><small>설정한 고정 수당</small></article>
        </section>
        <div className="privacy-note"><ShieldCheck size={16}/>개인 시급과 수입은 다른 오피스 멤버에게 공개되지 않아.</div>
      </main>}

      {tab === 'office' && <main className="stack-page">
        <div className="page-heading"><div><div className="eyebrow">VIRTUAL OFFICE</div><h1>함께 일하기</h1></div><span className="member-count">{members.length} / 6명</span></div>
        <section className="panel office-header"><div><h2>{officeName}</h2><p>{officeId ? '실시간 오피스 연결됨' : '친구들과 같은 공간에서 일해봐'}</p></div><Users size={22}/></section>
        {!officeId && <section className="panel connect-panel">
          <button className="primary-action wide" onClick={createOffice} disabled={busy}><Plus size={17}/>내 오피스 만들기</button>
          <form className="join-form" onSubmit={joinOffice}><input value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="친구에게 받은 초대 코드" maxLength={12}/><button disabled={busy}>입장</button></form>
          <button className="text-action" onClick={randomMatch} disabled={busy}><Users size={16}/>랜덤 오피스 매칭</button>
        </section>}
        {officeId && <>
          {inviteCode && <section className="invite-bar"><div><small>친구 초대 코드</small><b>{inviteCode}</b></div><button onClick={copyInvite}><Copy size={14}/>코드 복사</button></section>}
          <section className="office-floor"><div className="floor-label"><span>OFFICE FLOOR</span><span>MAX 6</span></div><div className="desk-grid">{Array.from({length:6},(_,index)=>{
            const member=members[index];
            return <div className={'desk '+(member?'':'empty')} key={member?.id||index}>
              {member ? <><b>{member.name}</b><small>{member.state}</small><div className="speech">{member.status_message || '상태 메시지 없음'}</div></> : <><Plus size={20}/><b>빈자리</b><small>입장 가능</small></>}
            </div>;
          })}</div></section>
          <section className="panel status-panel"><div className="panel-title">내 근무 상태</div>
            <div className="status-actions">{['근무','점심','휴식','퇴근'].map(value=><button key={value} className={status===value?'selected':''} onClick={()=>changeStatus(value)}>{value}</button>)}</div>
            <form className="join-form" onSubmit={saveStatusMessage}><input value={statusMessage} onChange={e=>setStatusMessage(e.target.value)} placeholder="상태 메시지" maxLength={40}/><button>저장</button></form>
          </section>
          <section className="panel chat-panel"><div className="panel-title"><MessageCircle size={16}/>오피스 한마디</div>
            <div className="chat-list">{messages.map(message=><div className={'chat-bubble '+(message.mine?'mine':'')} key={message.id}><b>{message.name}</b><span>{message.body}</span></div>)}</div>
            <form className="join-form" onSubmit={sendMessage}><input value={chatDraft} onChange={e=>setChatDraft(e.target.value)} placeholder="동료에게 한마디" maxLength={500}/><button aria-label="전송"><Send size={16}/></button></form>
          </section>
        </>}
        <p className="helper-note">오피스에는 캐릭터·근무 상태·상태 메시지만 표시돼. 시급과 수입은 공유하지 않아.</p>
      </main>}

      {tab === 'settings' && <main className="stack-page">
        <div className="page-heading"><div><div className="eyebrow">MY SETTINGS</div><h1>근무 설정</h1></div><Settings2 size={22}/></div>
        {!session?.user ? <section className="panel auth-panel"><h2>이메일로 로그인</h2><p>비밀번호 없이 이메일 링크로 로그인할게.</p>
          <form onSubmit={sendMagicLink}><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="이메일 주소" required/><button className="primary-action wide" disabled={busy}>{busy?'전송 중…':'로그인 링크 받기'}</button></form>
          {emailSent&&<p className="success-text">메일함에서 로그인 링크를 확인해줘.</p>}
        </section> : <section className="panel auth-panel"><h2>로그인됨</h2><p>{session.user.email}</p><button className="text-action" onClick={signOut}><LogOut size={16}/>로그아웃</button></section>}
        <form className="panel settings-form" onSubmit={saveSettings}>
          <h2>급여 및 근무 시간</h2>
          <label>시간당 임금<input type="number" min="0" step="10" value={hourly} onChange={e=>setHourly(Number(e.target.value))}/></label>
          <div className="two-col"><label>출근 시간<input type="time" value={workStart} onChange={e=>setWorkStart(e.target.value)}/></label><label>퇴근 시간<input type="time" value={workEnd} onChange={e=>setWorkEnd(e.target.value)}/></label></div>
          <label>휴게 시간 (분)<input type="number" min="0" max="720" value={breakMinutes} onChange={e=>setBreakMinutes(Number(e.target.value))}/></label>
          <div className="two-col"><label>연장근무 배율<input type="number" min="1" max="5" step="0.1" value={overtimeRate} onChange={e=>setOvertimeRate(Number(e.target.value))}/></label><label>야간 가산 설정<input type="number" min="0" max="5" step="0.1" value={nightRate} onChange={e=>setNightRate(Number(e.target.value))}/></label></div>
          <label>휴일근무 배율<input type="number" min="0" max="5" step="0.1" value={holidayRate} onChange={e=>setHolidayRate(Number(e.target.value))}/></label>
          <label>월 고정 수당<input type="number" min="0" step="1000" value={fixedAllowance} onChange={e=>setFixedAllowance(Number(e.target.value))}/></label>
          <button className="primary-action wide" disabled={saving||!session?.user}>{saving?'저장 중…':'설정 저장하기'}</button>
          {!session?.user&&<small className="form-hint">로그인하면 설정이 계정에 저장돼.</small>}
        </form>
      </main>}

      <nav className="bottom-nav">
        <button className={tab==='home'?'active':''} onClick={()=>setTab('home')}><House size={20}/><span>홈</span></button>
        <button className={tab==='office'?'active':''} onClick={()=>setTab('office')}><Users size={20}/><span>함께 일하기</span></button>
        <button className={tab==='settings'?'active':''} onClick={()=>setTab('settings')}><Settings2 size={20}/><span>설정</span></button>
      </nav>
    </div>
    {toast&&<div role="status" className="toast">{toast}</div>}
  </div>;
}
