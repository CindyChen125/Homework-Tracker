import { EC_CLASSES, EE_CLASSES, MATH_CLASSES, classLabel } from '../lib/class-choices'

export default function ClassFields({ ec, ee, math, onEc, onEe, onMath }: {
  ec: string; ee: string; math: string; onEc: (value: string) => void; onEe: (value: string) => void; onMath: (value: string) => void
}) {
  return <>
    <label className="field"><span className="field-label">EC class</span>
      <select required value={ec} onChange={event => onEc(event.target.value)}>
        <option value="">Choose your EC class</option>
        {EC_CLASSES.map(value => <option key={value} value={value}>{classLabel(value)}</option>)}
      </select>
    </label>
    <label className="field"><span className="field-label">EE class</span>
      <select required value={ee} onChange={event => onEe(event.target.value)}>
        <option value="">Choose your EE class</option>
        {EE_CLASSES.map(value => <option key={value} value={value}>{classLabel(value)}</option>)}
      </select>
    </label>
    <label className="field"><span className="field-label">Math class</span>
      <select required value={math} onChange={event => onMath(event.target.value)}>
        <option value="">Choose your Math class</option>
        {MATH_CLASSES.map(value => <option key={value} value={value}>{classLabel(value)}</option>)}
      </select>
    </label>
  </>
}
