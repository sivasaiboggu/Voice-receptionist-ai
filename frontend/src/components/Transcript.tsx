import { recordLabel } from '../lib/utils'

export type Turn = { speaker: string; text: string; intent?: string }

export function parseTranscript(transcript: string): Turn[] {
  const turns: Turn[] = []
  for (const line of transcript.split(/\r?\n/)) {
    const match = /^(Agent|Caller):\s?(.*)$/.exec(line)
    if (match) turns.push({ speaker: match[1], text: match[2] })
    else if (turns.length) turns[turns.length - 1].text += `\n${line}`
    else if (line.trim()) turns.push({ speaker: '', text: line })
  }
  return turns
}

export function Transcript({ turns, animate = false }: { turns: Turn[]; animate?: boolean }) {
  return (
    <ol className="transcript">
      {turns.map(({ speaker, text, intent }, index) => (
        <li key={index} className={`transcript-turn${speaker === 'Caller' ? ' caller-turn' : ''}${animate ? ' turn-enter' : ''}`}>
          <strong className="speaker">{speaker}</strong>
          <div>{intent && <div className="muted transcript-intent">{recordLabel(intent)}</div>}<p className="reading">{text}</p></div>
        </li>
      ))}
    </ol>
  )
}
