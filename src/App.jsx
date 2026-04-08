import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { supabase } from './supabase'

const TABS = ['Network', 'Terrain']
const STATUS_ORDER = ['To reach', 'Reached out', 'Replied', 'Meeting', 'Following up', 'Pass']
const ALL_FILTERS = ['All', ...STATUS_ORDER]
const STAGE_OPTIONS = ['Pre-seed', 'Seed', 'Series A', 'Growth']
const STATUS_OPTIONS = STATUS_ORDER
const PRIORITY_OPTIONS = [
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'med' },
  { label: 'Low', value: 'low' },
]
const CONTACT_TYPE_OPTIONS = ['Investor', 'Founder', 'Operator', 'Met at event', 'Intro']
const TERRAIN_STATUS_OPTIONS = ['Going', 'Maybe', 'Pass']
const TERRAIN_FILTERS = ['All', ...TERRAIN_STATUS_OPTIONS, 'Conference', 'Dinner', 'Demo Day', 'Community']
const EVENT_TYPE_OPTIONS = ['Conference', 'Dinner', 'Demo Day', 'Community', 'Happy Hour', 'Other']

const initialForm = {
  name: '', title: '', fund: '', type: 'Investor', stage: '',
  how_met: '', last_contact: '', status: 'To reach', priority: 'med', notes: '',
}
const initialEventForm = {
  name: '', date: '', time: '', location: '', host: '',
  type: 'Conference', status: 'Maybe', goal: '', notes: '', source_url: '',
}
const initialFieldNoteForm = { name: '', fund: '', title: '', insight: '', followUp: '', notes: '' }

function App() {
  const [activeTab, setActiveTab] = useState('Network')
  return (
    <div className="app-shell">
      <nav className="top-nav">
        <div className="brand">Terrain</div>
        <div className="tab-list">
          {TABS.map((tab) => (
            <button key={tab} className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)} type="button">{tab}</button>
          ))}
        </div>
      </nav>
      {activeTab === 'Network' && <OutreachTab />}
      {activeTab === 'Terrain' && <TerrainTab />}
    </div>
  )
}
function TerrainCalendar({ events, calendarMonth, setCalendarMonth }) {
  const { year, month } = calendarMonth
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // Group Going/Maybe events by date
  const eventsByDate = {}
  for (const ev of events) {
    if (!ev.date || ev.status === 'Pass') continue
    if (!eventsByDate[ev.date]) eventsByDate[ev.date] = []
    eventsByDate[ev.date].push(ev)
  }

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  function prevMonth() {
    setCalendarMonth(({ year: y, month: m }) =>
      m === 0 ? { year: y - 1, month: 11 } : { year: y, month: m - 1 }
    )
  }
  function nextMonth() {
    setCalendarMonth(({ year: y, month: m }) =>
      m === 11 ? { year: y + 1, month: 0 } : { year: y, month: m + 1 }
    )
  }

  return (
    <div className="terrain-calendar">
      <div className="cal-header">
        <button className="cal-nav" onClick={prevMonth} type="button">‹</button>
        <span className="cal-month-label">{MONTH_NAMES[month]} {year}</span>
        <button className="cal-nav" onClick={nextMonth} type="button">›</button>
      </div>
      <div className="cal-grid">
        {DAYS.map(d => <div key={d} className="cal-day-name">{d}</div>)}
        {cells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} className="cal-cell cal-empty" />
          const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
          const dayEvents = eventsByDate[dateStr] || []
          const isToday = dateStr === todayStr
          return (
            <div key={dateStr} className={`cal-cell${isToday ? ' cal-today' : ''}`}>
              <span className="cal-day-num">{day}</span>
              <div className="cal-events">
                {dayEvents.map(ev => (
                  <div
                    key={ev.id}
                    className={`cal-event-pill cal-event-${ev.status?.toLowerCase()}`}
                    title={`${ev.name}${ev.location ? ' · ' + ev.location.split(' • ').slice(1).join('') : ''}`}
                  >
                    {ev.name.length > 22 ? ev.name.slice(0, 22) + '…' : ev.name}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <div className="cal-legend">
        <span className="cal-legend-item"><span className="cal-dot cal-dot-going" /> Going</span>
        <span className="cal-legend-item"><span className="cal-dot cal-dot-maybe" /> Maybe</span>
      </div>
    </div>
  )
}

function TerrainTab() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('All')
  const [viewMode, setViewMode] = useState('List')
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [expandedIds, setExpandedIds] = useState([])
  const [goalEditing, setGoalEditing] = useState({})
  const [eventModalOpen, setEventModalOpen] = useState(false)
  const [eventForm, setEventForm] = useState(initialEventForm)
  const [fieldNoteEvent, setFieldNoteEvent] = useState(null)
  const [fieldNoteForm, setFieldNoteForm] = useState(initialFieldNoteForm)
  const [flashMessage, setFlashMessage] = useState('')
  const [showPast, setShowPast] = useState(false)

  useEffect(() => {
    fetchEvents()
  }, [])

  useEffect(() => {
    if (!flashMessage) return undefined
    const timer = setTimeout(() => setFlashMessage(''), 2500)
    return () => clearTimeout(timer)
  }, [flashMessage])

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const aTime = a.date ? new Date(`${a.date}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER
      const bTime = b.date ? new Date(`${b.date}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER
      return aTime - bTime
    })
  }, [events])

  const today = useMemo(() => startOfDay(new Date()), [])

  const stats = useMemo(() => {
    const nextWeek = addDays(today, 7)
    let upcoming = 0
    let going = 0
    let thisWeek = 0

    for (const event of events) {
      const eventDate = event.date ? startOfDay(new Date(`${event.date}T00:00:00`)) : null
      if (!eventDate) continue

      if ((event.status === 'Going' || event.status === 'Maybe') && eventDate.getTime() >= today.getTime()) {
        upcoming += 1
      }
      if (event.status === 'Going') {
        going += 1
      }
      if (eventDate.getTime() >= today.getTime() && eventDate.getTime() <= nextWeek.getTime()) {
        thisWeek += 1
      }
    }

    return { upcoming, going, thisWeek }
  }, [events, today])

  const filteredEvents = useMemo(() => {
    if (filter === 'All') return sortedEvents
    if (TERRAIN_STATUS_OPTIONS.includes(filter)) {
      return sortedEvents.filter((event) => event.status === filter)
    }
    return sortedEvents.filter((event) => event.type === filter)
  }, [filter, sortedEvents])

  const [upcomingEvents, pastEvents] = useMemo(() => {
    const future = []
    const past = []

    for (const event of filteredEvents) {
      const eventDate = event.date ? startOfDay(new Date(`${event.date}T00:00:00`)) : null
      if (!eventDate || eventDate.getTime() >= today.getTime()) {
        future.push(event)
      } else {
        past.push(event)
      }
    }

    return [future, past]
  }, [filteredEvents, today])

  async function fetchEvents() {
    setLoading(true)
    setError('')

    const { data, error: fetchError } = await supabase
      .from('events')
      .select('*')
      .order('date', { ascending: true })

    if (fetchError) {
      setError(fetchError.message)
      setEvents([])
    } else {
      setEvents(data ?? [])
    }

    setLoading(false)
  }

  function openEventModal() {
    setEventForm(initialEventForm)
    setEventModalOpen(true)
  }

  async function saveEvent(event) {
    event.preventDefault()
    if (!eventForm.name.trim()) return

    const payload = {
      name: eventForm.name.trim(),
      date: eventForm.date || null,
      location: eventForm.time.trim()
        ? `${eventForm.time.trim()} • ${eventForm.location.trim() || 'San Francisco, CA'}`
        : eventForm.location.trim() || null,
      host: eventForm.host.trim() || null,
      type: eventForm.type || null,
      status: eventForm.status || 'Maybe',
      goal: eventForm.goal.trim() || null,
      notes: eventForm.notes.trim() || null,
      source_url: eventForm.source_url.trim() || null,
      source: 'manual',
    }

    const { error: insertError } = await supabase.from('events').insert(payload)
    if (insertError) {
      setError(insertError.message)
      return
    }

    setEventModalOpen(false)
    setEventForm(initialEventForm)
    await fetchEvents()
  }

  async function updateEventStatus(eventId, status) {
    const { error: updateError } = await supabase.from('events').update({ status }).eq('id', eventId)
    if (updateError) {
      setError(updateError.message)
      return
    }

    setEvents((prev) => prev.map((event) => (event.id === eventId ? { ...event, status } : event)))
  }

  async function updateEventGoal(eventId, goal) {
    const { error: updateError } = await supabase.from('events').update({ goal: goal || null }).eq('id', eventId)
    if (updateError) {
      setError(updateError.message)
      return
    }

    setEvents((prev) => prev.map((event) => (event.id === eventId ? { ...event, goal } : event)))
  }

  async function updateEventNotes(eventId, notes) {
    const { error: updateError } = await supabase.from('events').update({ notes: notes || null }).eq('id', eventId)
    if (updateError) {
      setError(updateError.message)
      return
    }

    setEvents((prev) => prev.map((event) => (event.id === eventId ? { ...event, notes } : event)))
  }

  function toggleExpanded(eventId) {
    setExpandedIds((prev) =>
      prev.includes(eventId) ? prev.filter((id) => id !== eventId) : [...prev, eventId],
    )
  }

  function openFieldNoteModal(terrainEvent) {
    setFieldNoteEvent(terrainEvent)
    setFieldNoteForm(initialFieldNoteForm)
  }

  async function saveFieldNote(event) {
    event.preventDefault()
    if (!fieldNoteEvent) return

    const meetingDate = fieldNoteEvent.date ? formatIsoAsReadable(fieldNoteEvent.date) : 'unknown date'
    const noteParts = [
      `Met at ${fieldNoteEvent.name} on ${meetingDate}.`,
      `Insight: ${fieldNoteForm.insight.trim() || '—'}.`,
      `Follow-up: ${fieldNoteForm.followUp.trim() || '—'}.`,
    ]

    if (fieldNoteForm.notes.trim()) {
      noteParts.push(`Notes: ${fieldNoteForm.notes.trim()}`)
    }

    const payload = {
      name: fieldNoteForm.name.trim() || 'Unknown',
      title: fieldNoteForm.title.trim() || null,
      fund: fieldNoteForm.fund.trim() || null,
      status: 'To reach',
      notes: noteParts.join(' '),
      how_met: fieldNoteEvent.name,
    }

    const { error: insertError } = await supabase.from('contacts').insert(payload)
    if (insertError) {
      setError(insertError.message)
      return
    }

    setFieldNoteEvent(null)
    setFieldNoteForm(initialFieldNoteForm)
    setFlashMessage('Contact added to Network')
  }

  return (
    <section className="outreach-wrap terrain-wrap">
      <div className="outreach-header">
        <h1>Terrain · San Francisco</h1>
        <button className="btn btn-dark" onClick={openEventModal} type="button">
          + Add event
        </button>
      </div>

      <div className="stats-grid terrain-stats-grid">
        <StatCard label="Upcoming events" value={stats.upcoming} />
        <StatCard label="Going" value={stats.going} />
        <StatCard label="This week" value={stats.thisWeek} />
      </div>

      <div className="filter-row">
        {TERRAIN_FILTERS.map((value) => (
          <button
            key={value}
            className={`filter-pill ${filter === value ? 'active' : ''}`}
            onClick={() => setFilter(value)}
            type="button"
          >
            {value}
          </button>
        ))}
        <div className="view-toggle" style={{ marginLeft: 'auto' }}>
          {['List', 'Calendar'].map(v => (
            <button
              key={v}
              className={`filter-pill ${viewMode === v ? 'active' : ''}`}
              onClick={() => setViewMode(v)}
              type="button"
            >{v}</button>
          ))}
        </div>
      </div>

      {flashMessage && <div className="flash-message">{flashMessage}</div>}

      {loading ? (
        <div className="state-card">Loading...</div>
      ) : error ? (
        <div className="state-card error">{error}</div>
      ) : filteredEvents.length === 0 ? (
        <div className="state-card">No events yet. Add your first one.</div>
      ) : viewMode === 'Calendar' ? (
        <TerrainCalendar
          events={events}
          calendarMonth={calendarMonth}
          setCalendarMonth={setCalendarMonth}
        />
      ) : (
        <div className="terrain-list">
          {upcomingEvents.map((terrainEvent) => (
            <TerrainEventCard
              key={terrainEvent.id}
              event={terrainEvent}
              expanded={expandedIds.includes(terrainEvent.id)}
              goalEditing={goalEditing[terrainEvent.id] || false}
              onToggleExpanded={() => toggleExpanded(terrainEvent.id)}
              onSetGoalEditing={(editing) =>
                setGoalEditing((prev) => ({
                  ...prev,
                  [terrainEvent.id]: editing,
                }))
              }
              onUpdateGoal={updateEventGoal}
              onUpdateNotes={updateEventNotes}
              onUpdateStatus={updateEventStatus}
              onAddFieldNote={() => openFieldNoteModal(terrainEvent)}
            />
          ))}

          {pastEvents.length > 0 && (
            <div className="past-events-wrap">
              <button className="past-toggle" onClick={() => setShowPast((prev) => !prev)} type="button">
                {showPast ? 'Hide' : 'Show'} past events ({pastEvents.length})
              </button>
              {showPast &&
                pastEvents.map((terrainEvent) => (
                  <TerrainEventCard
                    key={terrainEvent.id}
                    event={terrainEvent}
                    expanded={expandedIds.includes(terrainEvent.id)}
                    goalEditing={goalEditing[terrainEvent.id] || false}
                    onToggleExpanded={() => toggleExpanded(terrainEvent.id)}
                    onSetGoalEditing={(editing) =>
                      setGoalEditing((prev) => ({
                        ...prev,
                        [terrainEvent.id]: editing,
                      }))
                    }
                    onUpdateGoal={updateEventGoal}
                    onUpdateNotes={updateEventNotes}
                    onUpdateStatus={updateEventStatus}
                    onAddFieldNote={() => openFieldNoteModal(terrainEvent)}
                  />
                ))}
            </div>
          )}
        </div>
      )}

      {eventModalOpen && (
        <AddEventModal
          form={eventForm}
          onCancel={() => setEventModalOpen(false)}
          onChange={setEventForm}
          onSave={saveEvent}
        />
      )}

      {fieldNoteEvent && (
        <FieldNoteModal
          terrainEvent={fieldNoteEvent}
          form={fieldNoteForm}
          onCancel={() => setFieldNoteEvent(null)}
          onChange={setFieldNoteForm}
          onSave={saveFieldNote}
        />
      )}
    </section>
  )
}

const PRECOGNITION_API = 'https://yc-scout.onrender.com'

function buildGCalUrl(event) {
  const dateStr = event.date || ''
  const locationRaw = event.location || ''
  const timePart = locationRaw.includes(' • ') ? locationRaw.split(' • ')[0].trim() : null
  const locationClean = locationRaw.includes(' • ') ? locationRaw.split(' • ').slice(1).join(' • ') : locationRaw

  let startStr, endStr
  if (timePart) {
    // Parse "5:00 PM" or "10:00 AM" into 24h and build Google Calendar date-time
    const match = timePart.match(/(\d+):(\d+)\s*(AM|PM)/i)
    if (match) {
      let h = parseInt(match[1])
      const m = parseInt(match[2])
      const ampm = match[3].toUpperCase()
      if (ampm === 'PM' && h !== 12) h += 12
      if (ampm === 'AM' && h === 12) h = 0
      const endH = h + 2  // default 2 hour duration
      const pad = n => String(n).padStart(2, '0')
      const base = dateStr.replace(/-/g, '')
      startStr = `${base}T${pad(h)}${pad(m)}00`
      endStr = `${base}T${pad(endH)}${pad(m)}00`
    }
  }
  if (!startStr) {
    // All-day fallback
    const base = dateStr.replace(/-/g, '')
    const nextDay = new Date(dateStr)
    nextDay.setDate(nextDay.getDate() + 1)
    const nextBase = nextDay.toISOString().slice(0, 10).replace(/-/g, '')
    startStr = base
    endStr = nextBase
  }

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.name || 'Event',
    dates: `${startStr}/${endStr}`,
    location: locationClean,
    details: [
      event.host ? `Host: ${event.host}` : '',
      event.source_url ? `RSVP: ${event.source_url}` : '',
    ].filter(Boolean).join('\n'),
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

const DEFAULT_POSTURE = 'You are a VC scout with a signal edge, not a job seeker. Lead by sharing what you are tracking. If roles come up: "I am looking for a home where I can do this kind of sourcing at scale." Never ask about open positions directly.'

const DEFAULT_QUESTIONS = [
  '"What are you seeing in your deal flow right now that most people aren\'t paying attention to yet?"',
  '"Where do you think founder density is building before the market has noticed?"',
  '"What would make you immediately excited about a founder you just met?"',
]

const HOST_INTEL = {
  'forerunner': {
    gp: 'Kirsten Green',
    focus: 'consumer, brand, commerce, next-gen retail',
    stage: 'Series A–B',
    topics: ['consumer', 'retail', 'brand', 'commerce', 'food', 'creator'],
    angle: 'Forerunner backs brands that shift how people live — cultural timing and consumer psychology over unit economics.',
    hook: 'Lead with consumer behavior shifts, not TAM. Kirsten Green thinks in waves of taste, not market maps.',
    icebreaker: 'Kirsten Green lights up when you mention a specific brand moment — a brand she hasn\'t heard of that blew up in Europe. Ask her view on the next cultural shift in consumer before it hits US data.',
        questions: [
      '"Where are you seeing consumer behavior shift before it shows up in data?"',
      '"What does a brand look like today that has the same structural moat as Glossier did in 2015?"',
      '"How do you think about EU consumer trends as a leading indicator for the US?"',
    ],
    posture: `${DEFAULT_POSTURE} With Forerunner: share a specific consumer signal from Precognition — a cluster of founders converging on the same behavior shift. That is the language they speak.`,
  },
  'hustle fund': {
    gp: 'Elizabeth Yin',
    focus: 'pre-seed, B2B SaaS, founder velocity',
    stage: 'pre-seed / seed',
    topics: ['saas', 'b2b', 'productivity', 'developer'],
    angle: 'Hustle Fund bets on founder speed over pedigree. Elizabeth Yin is vocal that execution velocity is the only signal that matters pre-traction.',
    hook: 'Lead with speed of execution and scrappy early traction.',
    icebreaker: 'Elizabeth Yin is very active on X and writes candidly about VC dysfunction. She likes people who read her work. Also ask about building Hustle Fund small on purpose — she talks about it proudly.',
        questions: [
      '"How do you separate genuine execution speed from hustle theater in the first meeting?"',
      '"What\'s the earliest signal you\'ve seen that turned into a real company?"',
      '"Where do you think pre-seed is underpriced right now?"',
    ],
    posture: `${DEFAULT_POSTURE} With Hustle Fund: show your own velocity — mention how fast you built Precognition and what it already surfaces.`,
  },
  'precursor': {
    gp: 'Charles Hudson',
    focus: 'pre-product pre-seed, underrepresented founders',
    stage: 'pre-seed',
    topics: [],
    angle: 'Precursor funds ideas and people before there is a product. Most pre-conviction fund in SF.',
    hook: 'Lead with a thesis on a space, not a deck. Charles values thinking over traction.',
    icebreaker: 'Charles Hudson is warm and not typical Sand Hill. Into music and the SF community. Easy opener: what does he think is underrated about the SF ecosystem right now?',
        questions: [
      '"What does a founder look like at the pre-product stage that makes you say yes before anyone else would?"',
      '"How do you think about sourcing founders who wouldn\'t naturally find their way to Sand Hill Road?"',
      '"What thesis are you building conviction around right now that isn\'t consensus yet?"',
    ],
    posture: `${DEFAULT_POSTURE} With Precursor: show your sourcing instinct. You are already doing what their scouts do — finding signal before it is obvious.`,
  },
  'south park commons': {
    gp: 'Ruchi Sanghvi / community',
    focus: 'technical founders, deep exploration, pre-idea',
    stage: 'community / pre-company',
    topics: ['developer', 'infrastructure', 'research'],
    angle: 'SPC is a founder community, not a VC. Members explore ideas together before committing to a company.',
    hook: 'Come with intellectual curiosity and a problem you are obsessing over.',
    icebreaker: 'SPC culture: low ego, curiosity beats credentials. Best opener with anyone in the room: "what\'s the problem you can\'t stop thinking about?" Works every time.',
        questions: [
      '"What kinds of exploration do SPC members do that you don\'t see in the broader ecosystem?"',
      '"Where do you see the most interesting pre-company thinking happening right now?"',
      '"What problems do you wish more technical founders were working on?"',
    ],
    posture: `${DEFAULT_POSTURE} SPC values intellectual honesty over polish — be direct about what you are exploring and why.`,
  },
  'a16z': {
    gp: 'Marc Andreessen / various',
    focus: 'AI, crypto, bio, consumer, fintech',
    stage: 'seed through growth',
    topics: ['ai', 'crypto', 'infrastructure', 'developer'],
    angle: 'a16z looks for category-defining companies, not incremental improvements. Platform shifts only.',
    hook: 'Lead with why this is a platform shift. They want to back the next computing paradigm.',
    icebreaker: 'a16z partners publish constantly — find who\'s in the room and reference something specific they\'ve written. They notice when people actually read their work.',
        questions: [
      '"What platform shift do you think is still underestimated by the market right now?"',
      '"How do you think about founder signal at the earliest stages before a paradigm is obvious?"',
      '"Where is the best early-stage activity happening that isn\'t getting a16z-scale attention yet?"',
    ],
    posture: `${DEFAULT_POSTURE} With a16z: think big. They are not interested in niches. Frame Precognition as a signal infrastructure layer, not a tool.`,
  },
  'collaborative fund': {
    gp: 'Craig Shapiro',
    focus: 'impact, consumer, climate, future of work',
    stage: 'seed–Series A',
    topics: ['consumer', 'climate', 'impact', 'sustainability'],
    angle: 'Collaborative Fund backs companies where doing good and doing well are the same bet.',
    hook: 'Frame mission as structural moat, not values add-on.',
    icebreaker: 'Craig Shapiro ties culture (music, skate, art) to brand infrastructure. Ask what he thinks has changed in impact investing over the last 5 years — he has strong opinions and enjoys the question.',
        questions: [
      '"Where do you see mission becoming a competitive advantage rather than a marketing layer?"',
      '"What impact vertical is most underinvested relative to the founder activity you\'re seeing?"',
      '"How do you think about consumer brands where the EU market is 2-3 years ahead of the US?"',
    ],
    posture: `${DEFAULT_POSTURE} With Collaborative: your EU impact background (Lita.co) is directly relevant. Lead with that lens.`,
  },
  'first round': {
    gp: 'Josh Kopelman',
    focus: 'B2B SaaS, marketplace, consumer tech',
    stage: 'seed',
    topics: ['saas', 'marketplace', 'consumer', 'b2b'],
    angle: 'First Round is the gold standard seed fund — known for deep founder support and the First Round Review.',
    hook: 'Show you have done the work on your category. They love founders who think like writers.',
    icebreaker: 'Josh Kopelman is self-deprecating and direct. Opener: "what do you think seed investing consistently gets wrong about founder-market fit?" He will have an answer.',
        questions: [
      '"What does the First Round Review tell you about what founders are actually struggling with right now?"',
      '"Where do you see seed-stage companies getting the most leverage from AI tools in their operations?"',
      '"What category do you wish you were seeing more founder activity in?"',
    ],
    posture: `${DEFAULT_POSTURE} First Round respects deep category knowledge. Show you have done the reading.`,
  },
  'imaginary': {
    gp: 'Natalie Massenet',
    focus: 'luxury, fashion, consumer, culture',
    stage: 'seed–Series A',
    topics: ['consumer', 'fashion', 'luxury', 'brand', 'retail', 'creator'],
    angle: 'Imaginary Ventures is the EU-to-US taste bridge. Natalie Massenet built Net-a-Porter — she pattern-matches on category-defining consumer brands.',
    hook: 'Your EU consumer lens is your edge here. Lead with it.',
    icebreaker: 'Natalie Massenet built Net-a-Porter in London and has a strong sense of European culture. Opener: name a brand you\'ve seen in Paris that hasn\'t landed in the US yet, and why it will. That\'s her language.',
        questions: [
      '"How do you think about EU consumer brands as early signals for what the US market will want in 2-3 years?"',
      '"What does a luxury brand look like today that has the distribution moat Net-a-Porter had in 2000?"',
      '"Where is taste shifting in consumer that hasn\'t been fully captured by US founders yet?"',
    ],
    posture: `${DEFAULT_POSTURE} With Natalie: your EU background is the pitch. You have seen what US consumers want before they know they want it.`,
  },
  'dbl partners': {
    gp: 'Nancy Pfund',
    focus: 'impact, climate, healthcare, education',
    stage: 'seed–growth',
    topics: ['climate', 'impact', 'health', 'education', 'sustainability'],
    angle: 'DBL pioneered impact + returns. They backed Tesla and Revolution Foods — mission as structural business advantage.',
    hook: 'Show the impact thesis is load-bearing, not decorative.',
    icebreaker: 'Nancy Pfund backed Tesla in 2006 when it was deeply unfashionable. She responds to rigour, not optimism. Ask how she thinks about the current climate hype cycle versus what DBL saw then.',
        questions: [
      '"What does a company look like today where the impact thesis is actually what creates the defensibility?"',
      '"Where do you see climate tech founder activity concentrating before the capital has followed?"',
      '"How has the definition of \'double bottom line\' shifted since you backed Tesla?"',
    ],
    posture: `${DEFAULT_POSTURE} DBL values rigor over optimism. Come with a specific signal, not a vision.`,
  },
  'y combinator': {
    gp: 'Garry Tan',
    focus: 'all sectors, global, technical founders',
    stage: 'pre-seed',
    topics: [],
    angle: 'YC is the highest-signal accelerator in the world. W26 batch surfaces the best early-stage companies of the year.',
    hook: 'Spotting the one company others will miss is the game. Come with a sector thesis.',
    icebreaker: 'YC social opener with anyone in the room: "which presentation surprised you the most?" Instant conversation starter. With YC staff: be precise on sector thesis — "excited about AI" won\'t land.',
        questions: [
      '"What pattern have you seen in this batch that you didn\'t expect?"',
      '"Which sectors are the most technically ambitious founders gravitating toward right now?"',
      '"Where do you think YC is still underrepresented in terms of founder backgrounds or geographies?"',
    ],
    posture: `${DEFAULT_POSTURE} At YC events: sector thesis is your currency. Show you can spot the non-obvious one.`,
  },
  'arnaud auger': {
    gp: 'Arnaud Auger',
    focus: 'AI, deep tech, longevity, neurotech, cognitive health',
    stage: 'Series A–C',
    topics: ['longevity', 'health', 'brain', 'neuro', 'biotech', 'aging'],
    angle: 'Arnaud Auger is Director at Cathay Innovation ($2.7B AUM) and co-founder of Don\'t Die SF. Capital allocator and longevity practitioner — rare combination.',
    hook: 'Lead with founder signals in AI × longevity. Show you are tracking the space before it is obvious.',
    icebreaker: 'He tracks his own health data and has strong opinions on Bryan Johnson — ask his take. Or: what the Don\'t Die community has taught him about how founders think differently about their own health.',
        questions: [
      '"What founder signals tell you something real is happening in a longevity vertical — before press catches it?"',
      '"Where is the biggest gap between what the science says is possible and what\'s actually being built?"',
      '"Is Don\'t Die SF surfacing founders you wouldn\'t see through traditional deal flow?"',
    ],
    posture: `${DEFAULT_POSTURE} With Arnaud: share your sourcing methodology. "I track pre-visibility founder density — the same approach applies to longevity, I just don't have the dataset yet."`,
  },
  'cathay innovation': {
    gp: 'Arnaud Auger',
    focus: 'AI, deep tech, longevity, global expansion',
    stage: 'Series A–C',
    topics: ['longevity', 'health', 'brain', 'neuro', 'ai', 'deep tech'],
    angle: 'Cathay Innovation ($2.7B AUM) has a real longevity thesis and global lens. Rare combination at this fund size.',
    hook: 'Lead with the intersection of AI and longevity biomarkers. Think in decades.',
    icebreaker: 'Cathay has a unique French-Chinese origin — backed partly by LVMH family office. Good opener: how the fund navigates US-China tech dynamics, or what European founders misunderstand about breaking into the US.',
        questions: [
      '"How does Cathay\'s global LP base shape which longevity bets you take versus a purely US-focused fund?"',
      '"What does the longevity founder look like that gets you excited at the Series A stage?"',
      '"Where do you see AI making the biggest dent in the aging research pipeline?"',
    ],
    posture: DEFAULT_POSTURE,
  },
  'don\'t die': {
    gp: 'Arnaud Auger + Community',
    focus: 'longevity, biohacking, neurotech, cognitive health',
    stage: 'community',
    topics: ['longevity', 'health', 'brain', 'neuro', 'biotech'],
    angle: 'Don\'t Die SF is a longevity practitioner community — founders, investors, and scientists serious about the science.',
    hook: 'This crowd respects signal over story. Come with a specific observation, not a vision.',
    icebreaker: 'Everyone in the room personally tracks their health data. Opener: "what practice have you added recently that surprised you?" Almost universal answer — instant human connection before you get to work.',
        questions: [
      '"What is the most underrated longevity intervention that doesn\'t have a company around it yet?"',
      '"Where do you see AI creating the most leverage in extending healthspan versus lifespan?"',
      '"What founder signal in this space would make you immediately pay attention?"',
    ],
    posture: DEFAULT_POSTURE,
  },
  'obvious ventures': {
    gp: 'James Joaquin / Ev Williams',
    focus: 'health, sustainability, education, impact',
    stage: 'seed–Series B',
    topics: ['climate', 'health', 'education', 'sustainability', 'impact'],
    angle: 'Obvious Ventures backs "world positive" companies — profit and planet aligned structurally.',
    hook: 'Mission must be load-bearing, not a differentiator.',
    icebreaker: 'If Ev Williams is there: ask what technology gets wrong about human behaviour — he built Twitter and Medium and thinks deeply about this. James Joaquin is more operational; ask about a portfolio surprise.',
        questions: [
      '"How do you identify when a mission is structurally baked in versus bolted on?"',
      '"What impact vertical do you think is most underinvested relative to the urgency?"',
      '"Where are you seeing founder activity that the impact investing world hasn\'t priced in yet?"',
    ],
    posture: DEFAULT_POSTURE,
  },
  'village global': {
    gp: 'Erik Torenberg',
    focus: 'B2B SaaS, consumer, founders-first',
    stage: 'pre-seed–seed',
    topics: ['saas', 'consumer', 'community', 'b2b'],
    angle: 'Village Global is network-driven — peer cohorts over traditional VC hierarchy.',
    hook: 'Show you are a connector. Village bets on founders who attract other founders.',
    icebreaker: 'Erik Torenberg is a prolific writer and podcaster — check if he published something this week and reference it. Good opener: what does he think is the most underrated founder community in SF right now?',
        questions: [
      '"How does the peer cohort model change which founders you see versus a traditional fund?"',
      '"What does \'network density\' look like as a signal for a company\'s early trajectory?"',
      '"Where do you see the most interesting founder communities forming right now outside of YC?"',
    ],
    posture: DEFAULT_POSTURE,
  },
}

function getHostIntel(hostName) {
  if (!hostName) return null
  const lower = hostName.toLowerCase()
  for (const [key, intel] of Object.entries(HOST_INTEL)) {
    if (lower.includes(key)) return intel
  }
  return null
}

async function fetchEventBrief(eventName, eventHost) {
  try {
    const [themesRes, breaksRes, statsRes] = await Promise.all([
      fetch(`${PRECOGNITION_API}/api/themes`),
      fetch(`${PRECOGNITION_API}/api/emergence`),
      fetch(`${PRECOGNITION_API}/api/stats`),
    ])
    const themes = await themesRes.json()
    const breaksRaw = await breaksRes.json()
    const stats = await statsRes.json()

    // ── Parse breaks correctly (API returns {newThemes, inflectionFounders}) ─
    const inflections = (breaksRaw?.inflectionFounders || [])
      .filter(b => b.score >= 20 || b.eventType === 'score_threshold' || b.eventType === 'commit_spike' || b.eventType === 'star_spike')
      .slice(0, 3)

    // ── Patterns signal (top clusters) ───────────────────────
    const topThemes = [...themes].sort((a, b) => b.emergenceScore - a.emergenceScore)
    const hostLower = (eventHost || '').toLowerCase()
    const isConsumer = ['forerunner', 'imaginary', 'lita', 'consumer', 'collaborative'].some(k => hostLower.includes(k))
    const isInfra = ['a16z', 'sequoia', 'benchmark', 'infrastructure', 'databricks'].some(k => hostLower.includes(k))
    const isSecurity = ['cybersecurity', 'security', 'cyber'].some(k => hostLower.includes(k))

    const filtered = isConsumer
      ? topThemes.filter(t => /consumer|e-commerce|retail|brand|food|culinary|creator/i.test(t.name))
      : isInfra ? topThemes.filter(t => /infra|data|developer|devtools|distributed|cloud/i.test(t.name))
      : isSecurity ? topThemes.filter(t => /security|cyber|privacy/i.test(t.name))
      : topThemes
    const displayThemes = (filtered.length >= 2 ? filtered : topThemes).slice(0, 3)

    // ── Flow signal (sector heat from all themes) ─────────────
    const sectorMap = {}
    themes.forEach(t => {
      const s = t.sector || 'Other'
      if (!sectorMap[s]) sectorMap[s] = { count: 0, founders: 0 }
      sectorMap[s].count++
      sectorMap[s].founders += t.builderCount || 0
    })
    const sectorRanked = Object.entries(sectorMap)
      .filter(([s]) => s !== 'Other')
      .sort((a, b) => b[1].founders - a[1].founders)
    const hotSector = sectorRanked[0]
    const risingSector = sectorRanked[1]

    // ── Breaks signal ────────────────────────────────────────
    const recentBreak = inflections[0]

    // ── Host intel ────────────────────────────────────────────
    const hostIntel = getHostIntel(eventHost)

    // ── Check if Precognition has domain-relevant themes ──────
    const hostTopics = hostIntel?.topics || []
    const relevantThemes = hostTopics.length > 0
      ? topThemes.filter(t => {
          const name = t.name.toLowerCase()
          // Must match on the theme NAME (not sector) with a whole-word-ish check
          // and must have enough founders to be a real signal
          return t.builderCount >= 6 && hostTopics.some(topic => {
            const re = new RegExp(`\\b${topic}`, 'i')
            return re.test(name)
          })
        })
      : displayThemes
    const hasDomainSignal = relevantThemes.length >= 2

    // ── Build brief ───────────────────────────────────────────
    const points = []

    // Point 1 — host context
    if (hostIntel) {
      points.push(`Host: ${hostIntel.angle} ${hostIntel.hook}`)
    }

    // Point 2 — icebreaker (if known)
    if (hostIntel?.icebreaker) {
      points.push(`Ice breaker: ${hostIntel.icebreaker}`)
    }

    if (hasDomainSignal) {
      // Precognition has relevant data — show it
      points.push(`Pattern: "${relevantThemes[0].name}" is the sharpest cluster in this domain — ${relevantThemes[0].builderCount} founders building independently. Early signal, not yet visible in press.`)
      if (relevantThemes[1]) {
        points.push(`Pattern: "${relevantThemes[1].name}" — ${relevantThemes[1].builderCount} founders. Second convergence point in the same space.`)
      }
    } else {
      // No domain signal in Precognition — be honest, pivot to methodology
      if (hostIntel?.topics?.length) {
        points.push(`Precognition doesn't have strong ${hostIntel.topics.slice(0,2).join(' / ')} signal yet — this vertical isn't well-represented in the dataset. Your edge is the methodology itself: you surface pre-visibility founder density before the market sees it. That's the conversation to have.`)
      } else {
        // Generic flow signal as context
        if (hotSector) {
          points.push(`Precognition signal: ${hotSector[0]} is the most active sector right now — ${hotSector[1].founders} founders across ${hotSector[1].count} clusters. Mention it if AI / dev tools comes up.`)
        }
        if (displayThemes[0]) {
          points.push(`Strongest cluster this week: "${displayThemes[0].name}" — ${displayThemes[0].builderCount} founders converging independently. Early signal.`)
        }
      }
    }

    // Questions — host-specific or default
    const questions = hostIntel?.questions?.length ? hostIntel.questions : DEFAULT_QUESTIONS
    points.push(`Questions to open with:\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`)

    // Break signal — only show if domain-relevant or no domain filter
    const breakIsRelevant = !hostTopics.length || (() => {
      if (!recentBreak) return false
      const breakContext = ((recentBreak.founderName || '') + ' ' + (recentBreak.signal || '')).toLowerCase()
      return hostTopics.some(t => breakContext.includes(t))
    })()
    if (recentBreak && breakIsRelevant) {
      const founderLabel = recentBreak.founderName || recentBreak.founderHandle || 'A tracked founder'
      points.push(`Live signal: ${founderLabel} — ${recentBreak.signal || 'crossed a momentum threshold this week'}. Pre-visibility from Precognition.`)
    }

    // Posture — always last
    const posture = hostIntel?.posture || DEFAULT_POSTURE
    points.push(`Posture: ${posture}`)

    return points
  } catch (e) {
    return ['Precognition data unavailable — check your connection to the intelligence backend.']
  }
}

function TerrainEventCard({
  event,
  expanded,
  goalEditing,
  onToggleExpanded,
  onSetGoalEditing,
  onUpdateGoal,
  onUpdateNotes,
  onUpdateStatus,
  onAddFieldNote,
}) {
  const [goalDraft, setGoalDraft] = useState(event.goal || '')
  const [notesDraft, setNotesDraft] = useState(event.notes || '')
  const [brief, setBrief] = useState(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const [networkAdded, setNetworkAdded] = useState([])

  useEffect(() => {
    setGoalDraft(event.goal || '')
  }, [event.goal])

  useEffect(() => {
    setNotesDraft(event.notes || '')
  }, [event.notes])

  async function saveGoal() {
    onSetGoalEditing(false)
    await onUpdateGoal(event.id, goalDraft.trim())
  }

  async function saveNotes() {
    await onUpdateNotes(event.id, notesDraft.trim())
  }

  return (
    <article className="terrain-card">
      <button className="terrain-main" onClick={onToggleExpanded} type="button">
        <div className="terrain-date-col">
          <div className="terrain-date">{formatTerrainDate(event.date)}</div>
          {(() => {
            const parts = (event.location || '').split(' • ')
            const time = parts.length > 1 ? parts[0] : null
            return time ? <div className="terrain-time">{time}</div> : null
          })()}
        </div>
        <div className="terrain-main-center">
          <div className="terrain-title-row">
            <strong>{event.name || 'Untitled event'}</strong>
            <span className={`event-type-badge ${eventTypeClass(event.type)}`}>{event.type || 'Other'}</span>
          </div>
          <div className="terrain-meta-row">
            {event.host && <span className="terrain-host-badge">{event.host}</span>}
            <small className="terrain-location">
              {(() => {
                const parts = (event.location || '').split(' • ')
                return parts.length > 1 ? parts.slice(1).join(' • ') : parts[0] || 'Location TBD'
              })()}
            </small>
          </div>
          {event.source_url && (
            <a
              href={event.source_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ fontSize: 11, color: '#2050a0', textDecoration: 'none', marginTop: 4, display: 'inline-block' }}
            >
              RSVP / View event →
            </a>
          )}
        </div>
      </button>

      <div className="terrain-side">
        <div className="terrain-status-pills">
          {TERRAIN_STATUS_OPTIONS.map((status) => (
            <button
              key={status}
              className={`status-pill ${statusPillClass(status)} ${event.status === status ? 'active' : ''}`}
              onClick={async () => {
                onUpdateStatus(event.id, status)
                if (status === 'Going' && !brief) {
                  setBriefLoading(true)
                  const points = await fetchEventBrief(event.name, event.host)
                  setBrief(points)
                  setBriefLoading(false)
                }
              }}
              type="button"
            >
              {status}
            </button>
          ))}
          {event.status === 'Going' && (
            <a
              href={buildGCalUrl(event)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="gcal-btn"
              title="Add to Google Calendar"
            >
              + Google Calendar
            </a>
          )}
        </div>

        <div className="goal-inline">
          <span className="goal-label">Goal</span>
          {goalEditing ? (
            <input
              autoFocus
              type="text"
              value={goalDraft}
              onChange={(inputEvent) => setGoalDraft(inputEvent.target.value)}
              onBlur={saveGoal}
              onKeyDown={(keyboardEvent) => {
                if (keyboardEvent.key === 'Enter') {
                  keyboardEvent.preventDefault()
                  saveGoal()
                }
              }}
            />
          ) : (
            <button className="goal-value" onClick={() => onSetGoalEditing(true)} type="button">
              {event.goal || 'Add goal'}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="terrain-expanded">

          {(event.status === 'Going' || brief || briefLoading) && (
            <div className="event-brief">
              <div className="event-brief-title">Insider brief — what to bring</div>
              {briefLoading && (
                <div style={{ fontSize: 12, color: '#aaa', fontStyle: 'italic' }}>Pulling signals from Precognition...</div>
              )}
              {brief && brief.map((point, i) => (
                <div key={i} className="event-brief-point">
                  <span className="brief-num">{i + 1}</span>
                  <span>{point}</span>
                </div>
              ))}
              {!brief && !briefLoading && event.status === 'Going' && (
                <button
                  className="btn btn-light"
                  style={{ fontSize: 11, padding: '4px 10px' }}
                  onClick={async () => {
                    setBriefLoading(true)
                    const points = await fetchEventBrief(event.name, event.host)
                    setBrief(points)
                    setBriefLoading(false)
                  }}
                  type="button"
                >
                  Generate brief
                </button>
              )}
            </div>
          )}

          {event.host && (
            <div className="host-network-row">
              {event.host.split('+').map(h => h.trim()).filter(Boolean).map(hostName => {
                const added = networkAdded.includes(hostName)
                return (
                  <button
                    key={hostName}
                    className={`btn ${added ? 'btn-light' : 'btn-dark'} host-add-btn`}
                    disabled={added}
                    type="button"
                    onClick={async () => {
                      const contact = {
                        name: hostName,
                        how_met: `Event: ${event.name}`,
                        status: 'To reach',
                        notes: `Met at: ${event.name} (${event.date})${event.source_url ? `\n${event.source_url}` : ''}`,
                      }
                      await supabase.from('contacts').insert(contact)
                      setNetworkAdded(prev => [...prev, hostName])
                    }}
                  >
                    {added ? `${hostName.split(' ')[0]} added ✓` : `+ Add ${hostName.split(' ')[0]} to Network`}
                  </button>
                )
              })}
            </div>
          )}

          <label>
            Notes
            <textarea
              rows="4"
              value={notesDraft}
              onChange={(inputEvent) => setNotesDraft(inputEvent.target.value)}
              onBlur={saveNotes}
            />
          </label>
          <button className="btn btn-light" onClick={onAddFieldNote} type="button">
            Add field note
          </button>
        </div>
      )}
    </article>
  )
}

function AddEventModal({ form, onCancel, onChange, onSave }) {
  return (
    <div className="modal-overlay" onClick={onCancel} role="presentation">
      <div className="modal-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <h3>Add event</h3>
        <form onSubmit={onSave}>
          <div className="modal-grid">
            <label>
              Name *
              <input
                required
                type="text"
                value={form.name}
                onChange={(event) => onChange((prev) => ({ ...prev, name: event.target.value }))}
              />
            </label>
            <label>
              Date
              <input
                type="date"
                value={form.date}
                onChange={(event) => onChange((prev) => ({ ...prev, date: event.target.value }))}
              />
            </label>
            <label>
              Time (e.g. 7:00 PM)
              <input
                type="text"
                placeholder="7:00 PM"
                value={form.time}
                onChange={(event) => onChange((prev) => ({ ...prev, time: event.target.value }))}
              />
            </label>
            <label>
              Location
              <input
                type="text"
                value={form.location}
                onChange={(event) => onChange((prev) => ({ ...prev, location: event.target.value }))}
              />
            </label>
            <label>
              Host
              <input
                type="text"
                value={form.host}
                onChange={(event) => onChange((prev) => ({ ...prev, host: event.target.value }))}
              />
            </label>
            <label>
              Type
              <select
                value={form.type}
                onChange={(event) => onChange((prev) => ({ ...prev, type: event.target.value }))}
              >
                {EVENT_TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={form.status}
                onChange={(event) => onChange((prev) => ({ ...prev, status: event.target.value }))}
              >
                {TERRAIN_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Goal
              <input
                type="text"
                value={form.goal}
                onChange={(event) => onChange((prev) => ({ ...prev, goal: event.target.value }))}
              />
            </label>
            <label>
              Source URL
              <input
                type="url"
                value={form.source_url}
                onChange={(event) => onChange((prev) => ({ ...prev, source_url: event.target.value }))}
              />
            </label>
            <label className="full-width">
              Notes
              <textarea
                rows="4"
                value={form.notes}
                onChange={(event) => onChange((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </label>
          </div>

          <div className="modal-actions">
            <div className="modal-actions-right">
              <button className="btn btn-light" onClick={onCancel} type="button">
                Cancel
              </button>
              <button className="btn btn-dark" type="submit">
                Save
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

function FieldNoteModal({ terrainEvent, form, onCancel, onChange, onSave }) {
  return (
    <div className="modal-overlay" onClick={onCancel} role="presentation">
      <div className="modal-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <h3>Field Note — {terrainEvent.name}</h3>
        <form onSubmit={onSave}>
          <div className="modal-grid">
            <label>
              Name
              <input
                type="text"
                value={form.name}
                onChange={(event) => onChange((prev) => ({ ...prev, name: event.target.value }))}
              />
            </label>
            <label>
              Fund/Company
              <input
                type="text"
                value={form.fund}
                onChange={(event) => onChange((prev) => ({ ...prev, fund: event.target.value }))}
              />
            </label>
            <label>
              Title
              <input
                type="text"
                value={form.title}
                onChange={(event) => onChange((prev) => ({ ...prev, title: event.target.value }))}
              />
            </label>
            <label className="full-width">
              One insight
              <textarea
                rows="3"
                placeholder="What did you learn?"
                value={form.insight}
                onChange={(event) => onChange((prev) => ({ ...prev, insight: event.target.value }))}
              />
            </label>
            <label className="full-width">
              Follow-up action
              <input
                type="text"
                placeholder="Send intro email, connect on LinkedIn..."
                value={form.followUp}
                onChange={(event) => onChange((prev) => ({ ...prev, followUp: event.target.value }))}
              />
            </label>
            <label className="full-width">
              Notes
              <textarea
                rows="4"
                value={form.notes}
                onChange={(event) => onChange((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </label>
          </div>

          <div className="modal-actions">
            <div className="modal-actions-right">
              <button className="btn btn-light" onClick={onCancel} type="button">
                Cancel
              </button>
              <button className="btn btn-dark" type="submit">
                Save
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

function OutreachTab() {
  /*
  create table contacts (
    id uuid default gen_random_uuid() primary key,
    name text not null,
    title text,
    fund text,
    stage text,
    type text default 'Investor',
    how_met text,
    last_contact date,
    status text default 'To reach',
    notes text,
    priority text default 'med',
    created_at timestamptz default now()
  );
  */

  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('All')
  const [viewMode, setViewMode] = useState('Table')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(initialForm)

  const filteredContacts = useMemo(() => {
    if (filter === 'All') return contacts
    return contacts.filter((contact) => contact.status === filter)
  }, [contacts, filter])

  const stats = useMemo(() => {
    const total = contacts.length
    const activeConversations = contacts.filter(
      (contact) => contact.status === 'Replied' || contact.status === 'Meeting',
    ).length
    const meetings = contacts.filter((contact) => contact.status === 'Meeting').length

    const numerator = contacts.filter(
      (contact) => contact.status === 'Replied' || contact.status === 'Meeting',
    ).length
    const denominator = contacts.filter(
      (contact) =>
        contact.status === 'Reached out' ||
        contact.status === 'Replied' ||
        contact.status === 'Meeting' ||
        contact.status === 'Following up',
    ).length

    const responseRate = denominator === 0 ? 0 : Math.round((numerator / denominator) * 100)

    return { total, activeConversations, meetings, responseRate }
  }, [contacts])

  useEffect(() => {
    fetchContacts()
  }, [])

  async function fetchContacts() {
    setLoading(true)
    setError('')

    const { data, error: fetchError } = await supabase
      .from('contacts')
      .select('*')
      .order('created_at', { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
      setContacts([])
    } else {
      setContacts(data ?? [])
    }

    setLoading(false)
  }

  function openAddModal() {
    setEditing(null)
    setForm(initialForm)
    setModalOpen(true)
  }

  function openEditModal(contact) {
    setEditing(contact)
    setForm({
      name: contact.name ?? '',
      title: contact.title ?? '',
      fund: contact.fund ?? '',
      type: contact.type ?? 'Investor',
      stage: contact.stage ?? '',
      how_met: contact.how_met ?? '',
      last_contact: contact.last_contact ?? '',
      status: contact.status ?? 'To reach',
      priority: contact.priority ?? 'med',
      notes: contact.notes ?? '',
    })
    setModalOpen(true)
  }

  async function handleSave(event) {
    event.preventDefault()

    if (!form.name.trim()) return

    const payload = {
      name: form.name.trim(),
      title: form.title.trim() || null,
      fund: form.fund.trim() || null,
      stage: form.stage || null,
      how_met: form.how_met.trim() || null,
      last_contact: form.last_contact || null,
      status: form.status || 'To reach',
      priority: form.priority || 'med',
      notes: form.notes.trim() || null,
    }

    const query = editing
      ? supabase.from('contacts').update(payload).eq('id', editing.id)
      : supabase.from('contacts').insert(payload)

    const { error: saveError } = await query

    if (saveError) {
      setError(saveError.message)
      return
    }

    setModalOpen(false)
    setEditing(null)
    setForm(initialForm)
    await fetchContacts()
  }

  async function handleDelete() {
    if (!editing) return

    const { error: deleteError } = await supabase.from('contacts').delete().eq('id', editing.id)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    setModalOpen(false)
    setEditing(null)
    setForm(initialForm)
    await fetchContacts()
  }

  return (
    <section className="outreach-wrap">
      <div className="outreach-header">
        <h1>Network · San Francisco</h1>
        <div className="header-actions">
          <div className="view-toggle">
            {['Table', 'Pipeline'].map((mode) => (
              <button
                key={mode}
                className={viewMode === mode ? 'active' : ''}
                onClick={() => setViewMode(mode)}
                type="button"
              >
                {mode}
              </button>
            ))}
          </div>
          <button className="btn btn-light" type="button">
            Import
          </button>
          <button className="btn btn-dark" onClick={openAddModal} type="button">
            + Add contact
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard label="Total contacts" value={stats.total} />
        <StatCard label="Active conversations" value={stats.activeConversations} />
        <StatCard label="Meetings booked" value={stats.meetings} />
        <StatCard label="Response rate" value={`${stats.responseRate}%`} />
      </div>

      <div className="filter-row">
        {ALL_FILTERS.map((status) => (
          <button
            key={status}
            className={`filter-pill ${filter === status ? 'active' : ''}`}
            onClick={() => setFilter(status)}
            type="button"
          >
            {status}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="state-card">Loading...</div>
      ) : error ? (
        <div className="state-card error">{error}</div>
      ) : filteredContacts.length === 0 ? (
        <div className="state-card">No contacts yet. Add your first one.</div>
      ) : viewMode === 'Table' ? (
        <OutreachTable contacts={filteredContacts} onEdit={openEditModal} />
      ) : (
        <PipelineView contacts={filteredContacts} onEdit={openEditModal} />
      )}

      <MessageTemplates />

      {modalOpen && (
        <ContactModal
          editing={editing}
          form={form}
          onCancel={() => setModalOpen(false)}
          onChange={setForm}
          onDelete={handleDelete}
          onSave={handleSave}
        />
      )}
    </section>
  )
}

function StatCard({ label, value }) {
  return (
    <article className="stat-card">
      <p>{label}</p>
      <h2>{value}</h2>
    </article>
  )
}

function OutreachTable({ contacts, onEdit }) {
  return (
    <div className="table-card">
      <table>
        <thead>
          <tr>
            <th>Priority</th>
            <th>Name</th>
            <th>Fund</th>
            <th>Type</th>
            <th>Stage</th>
            <th>How we met</th>
            <th>Last contact</th>
            <th>Status</th>
            <th>Notes</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {contacts.map((contact) => (
            <tr key={contact.id}>
              <td>
                <span className={`priority-dot ${priorityClass(contact.priority)}`} />
              </td>
              <td>
                <div className="name-cell">
                  <strong>{contact.name}</strong>
                  <span>{contact.title || '—'}</span>
                </div>
              </td>
              <td>{contact.fund || '—'}</td>
              <td>
                <TypeBadge type={contact.type} />
              </td>
              <td>
                {contact.stage ? (
                  <span className={`stage-badge ${stageClass(contact.stage)}`}>{contact.stage}</span>
                ) : (
                  '—'
                )}
              </td>
              <td>{contact.how_met || '—'}</td>
              <td>
                <span className={`last-contact ${contactAgeClass(contact.last_contact)}`}>
                  {formatDate(contact.last_contact)}
                </span>
              </td>
              <td>
                <StatusBadge status={contact.status} />
              </td>
              <td>
                <div className="notes-cell">{contact.notes || '—'}</div>
              </td>
              <td>
                <button className="icon-btn" onClick={() => onEdit(contact)} type="button" aria-label="Edit contact">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M4 20h4l10.5-10.5a1.4 1.4 0 0 0 0-2L16.5 5.5a1.4 1.4 0 0 0-2 0L4 16v4Z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                  </svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PipelineView({ contacts, onEdit }) {
  return (
    <div className="pipeline-wrap">
      {STATUS_ORDER.map((status) => {
        const laneContacts = contacts.filter((contact) => contact.status === status)

        return (
          <div className="pipeline-col" key={status}>
            <div className="pipeline-col-head">
              <StatusBadge status={status} />
              <span>{laneContacts.length}</span>
            </div>
            <div className="pipeline-list">
              {laneContacts.map((contact) => (
                <button className="pipeline-card" key={contact.id} onClick={() => onEdit(contact)} type="button">
                  <strong>{contact.name}</strong>
                  <span>{contact.fund || 'No fund listed'}</span>
                  <p>{contact.notes || 'No notes yet'}</p>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ContactModal({ editing, form, onCancel, onChange, onDelete, onSave }) {
  return (
    <div className="modal-overlay" onClick={onCancel} role="presentation">
      <div className="modal-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <h3>{editing ? 'Edit contact' : 'Add contact'}</h3>
        <form onSubmit={onSave}>
          <div className="modal-grid">
            <label>
              Name *
              <input
                required
                type="text"
                value={form.name}
                onChange={(event) => onChange((prev) => ({ ...prev, name: event.target.value }))}
              />
            </label>
            <label>
              Title
              <input
                type="text"
                value={form.title}
                onChange={(event) => onChange((prev) => ({ ...prev, title: event.target.value }))}
              />
            </label>
            <label>
              Fund
              <input
                type="text"
                value={form.fund}
                onChange={(event) => onChange((prev) => ({ ...prev, fund: event.target.value }))}
              />
            </label>
            <label>
              Type
              <select
                value={form.type}
                onChange={(event) => onChange((prev) => ({ ...prev, type: event.target.value }))}
              >
                {CONTACT_TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Stage
              <select
                value={form.stage}
                onChange={(event) => onChange((prev) => ({ ...prev, stage: event.target.value }))}
              >
                <option value="">Select stage</option>
                {STAGE_OPTIONS.map((stage) => (
                  <option key={stage} value={stage}>
                    {stage}
                  </option>
                ))}
              </select>
            </label>
            <label>
              How we met
              <input
                type="text"
                value={form.how_met}
                onChange={(event) => onChange((prev) => ({ ...prev, how_met: event.target.value }))}
              />
            </label>
            <label>
              Last contact
              <input
                type="date"
                value={form.last_contact}
                onChange={(event) => onChange((prev) => ({ ...prev, last_contact: event.target.value }))}
              />
            </label>
            <label>
              Status
              <select
                value={form.status}
                onChange={(event) => onChange((prev) => ({ ...prev, status: event.target.value }))}
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select
                value={form.priority}
                onChange={(event) => onChange((prev) => ({ ...prev, priority: event.target.value }))}
              >
                {PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority.value} value={priority.value}>
                    {priority.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="full-width">
              Notes
              <textarea
                rows="4"
                value={form.notes}
                onChange={(event) => onChange((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </label>
          </div>

          <div className="modal-actions">
            {editing && (
              <button className="btn btn-danger" onClick={onDelete} type="button">
                Delete
              </button>
            )}
            <div className="modal-actions-right">
              <button className="btn btn-light" onClick={onCancel} type="button">
                Cancel
              </button>
              <button className="btn btn-dark" type="submit">
                Save
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

function MessageTemplates() {
  const introTemplate =
    'Hi [Name], I recently moved to San Francisco from Paris and I am mapping founder signals across consumer in the US and EU. I built a lightweight Precognition workflow to spot early momentum and would value a quick exchange on what you are seeing at the pre-seed and seed stages.'
  const followUpTemplate =
    'Quick follow-up on a founder signal we discussed: [Founder] is showing strong early pull with [signal]. Happy to send a short brief with market context and adjacent opportunities if useful for your pipeline.'

  async function copyTemplate(text) {
    await navigator.clipboard.writeText(text)
  }

  return (
    <section className="templates-wrap">
      <article className="template-card">
        <h3>Cold intro — scout angle</h3>
        <p>{introTemplate}</p>
        <button className="btn btn-light" onClick={() => copyTemplate(introTemplate)} type="button">
          Copy
        </button>
      </article>
      <article className="template-card">
        <h3>Follow-up — signal share</h3>
        <p>{followUpTemplate}</p>
        <button className="btn btn-light" onClick={() => copyTemplate(followUpTemplate)} type="button">
          Copy
        </button>
      </article>
    </section>
  )
}

function StatusBadge({ status }) {
  const map = {
    'To reach': 'status-to-reach',
    'Reached out': 'status-reached-out',
    Replied: 'status-replied',
    Meeting: 'status-meeting',
    'Following up': 'status-following-up',
    Pass: 'status-pass',
  }

  return (
    <span className={`status-badge ${map[status] || 'status-to-reach'}`}>
      <span className="dot" />
      {status || 'To reach'}
    </span>
  )
}

function TypeBadge({ type }) {
  const map = {
    Investor: 'type-investor',
    Founder: 'type-founder',
    Operator: 'type-operator',
    'Met at event': 'type-met-event',
    Intro: 'type-intro',
  }

  return <span className={`type-badge ${map[type] || 'type-investor'}`}>{type || 'Investor'}</span>
}

function priorityClass(priority) {
  if (priority === 'high') return 'priority-high'
  if (priority === 'low') return 'priority-low'
  return 'priority-med'
}

function stageClass(stage) {
  if (stage === 'Pre-seed') return 'stage-preseed'
  if (stage === 'Seed') return 'stage-seed'
  return ''
}

function contactAgeClass(lastContact) {
  if (!lastContact) return 'age-old'

  const days = daysSince(lastContact)

  if (days <= 7) return 'age-fresh'
  if (days <= 30) return 'age-warm'
  return 'age-old'
}

function eventTypeClass(type) {
  if (type === 'Conference') return 'event-type-conference'
  if (type === 'Dinner') return 'event-type-dinner'
  if (type === 'Demo Day') return 'event-type-demo-day'
  if (type === 'Community') return 'event-type-community'
  if (type === 'Happy Hour') return 'event-type-happy-hour'
  return 'event-type-other'
}

function statusPillClass(status) {
  if (status === 'Going') return 'status-pill-going'
  if (status === 'Maybe') return 'status-pill-maybe'
  return 'status-pill-pass'
}

function formatDate(date) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString()
}

function formatTerrainDate(date) {
  if (!date) return 'TBD'
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatIsoAsReadable(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function daysSince(dateString) {
  const now = new Date()
  const then = new Date(dateString)
  const diff = now.getTime() - then.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function intelCategoryClass(category) {
  if (category === 'AI Infra') return 'intel-cat-ai'
  if (category === 'Consumer') return 'intel-cat-consumer'
  if (category === 'Fintech') return 'intel-cat-fintech'
  if (category === 'VC Mechanics') return 'intel-cat-vc'
  if (category === 'Product') return 'intel-cat-product'
  return 'intel-cat-general'
}


export default App
