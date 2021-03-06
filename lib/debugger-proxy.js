'use babel'

/* @flow */

import { CompositeDisposable, Disposable, Emitter } from 'atom'
import _ from 'underscore-plus'

import Breakpoint from './breakpoint'
import BreakpointEvent from './breakpoint-event'
import SessionEvent from './session-event'
import TargetEvent from './target-event'

import type { BreakpointLocation } from './breakpoint'
import type { Debugger, DebuggerTarget } from './types'
import type { StackFrame } from './stack-frame'
import type { Variable } from './variable'


export default class DebuggerProxy {
  emitter: Emitter;
  breakpoints: Array<Breakpoint>;
  activeDebugger: ?Debugger;
  activeSubscriptions: CompositeDisposable;

  constructor() {
    this.emitter = new Emitter()
    this.breakpoints = []
    this.activeDebugger = null
    this.activeSubscriptions = new CompositeDisposable()
  }

  getActiveDebugger(): ?Debugger {
    return this.activeDebugger
  }

  startSession(target: DebuggerTarget, debug: Debugger): void {
    this.activeSubscriptions.add(debug.onBreakpointEvent(event => {
      this.emitter.emit('breakpoint', event)

      if (event.type === 'moved') {
        event.breakpoint.activeBufferRow = event.bufferRow
      }
    }))

    this.activeSubscriptions.add(debug.onSessionEvent((event) => {
      this.emitter.emit('session', event)

      if (event.type !== 'terminated') {
        return
      }

      this.activeDebugger = null
      this.activeSubscriptions.dispose()
      this.activeSubscriptions = new CompositeDisposable()

      for (const breakpoint of this.breakpoints) {
        if (!breakpoint.activeBufferRow) {
          continue
        }

        const location = breakpoint.getLocation()

        if (!location.bufferRow || typeof location.bufferRow !== 'number') {
          throw new Error('BreakpointLocation.bufferRow must be a number')
        }

        const evt = new BreakpointEvent('moved', breakpoint, location.bufferRow)
        this.emitter.emit('breakpoint', evt)
        breakpoint.activeBufferRow = null
      }
    }))

    this.activeSubscriptions.add(debug.onTargetEvent((event) => {
      this.emitter.emit('target', event)
    }))

    debug.start(target, this.breakpoints)
    this.activeDebugger = debug
  }

  insertBreakpoint(breakpoint: Breakpoint): boolean {
    if (_.find(this.breakpoints, (val) => breakpoint.equals(val))) {
      return false
    }

    this.breakpoints.push(breakpoint)
    this.emitter.emit('breakpoint', new BreakpointEvent('inserted', breakpoint))
    return true
  }

  findBreakpoint(location: BreakpointLocation): ?Breakpoint {
    const breakpoint = new Breakpoint(location)
    const comparator = (value) => value.isEqual(breakpoint)

    return _.find(this.breakpoints, comparator)
  }

  removeBreakpoint(breakpoint: Breakpoint): boolean {
    const comparator = (val) => breakpoint.equals(val)
    const entry = _.find(this.breakpoints, comparator)

    if (entry === undefined) {
      return false
    }

    this.breakpoints = _.without(this.breakpoints, entry)
    this.emitter.emit('breakpoint', new BreakpointEvent('removed', entry))
    return true
  }

  enableBreakpoint(breakpoint: Breakpoint): boolean {
    const comparator = (val) => breakpoint.equals(val)
    const entry = _.find(this.breakpoints, comparator)

    if (entry === undefined || entry.isEnabled()) {
      return false
    }

    entry.enabled = true
    this.emitter.emit('breakpoint', new BreakpointEvent('enabled', entry))
    return true
  }

  disableBreakpoint(breakpoint: Breakpoint): boolean {
    const comparator = (val) => breakpoint.equals(val)
    const entry = _.find(this.breakpoints, comparator)

    if (entry === undefined || entry.isEnabled() === false) {
      return false
    }

    entry.enabled = false
    this.emitter.emit('breakpoint', new BreakpointEvent('disabled', entry))
    return true
  }

  setBreakpointCondition(breakpoint: Breakpoint, condition: string): boolean {
    const comparator = (val) => breakpoint.equals(val)
    const entry = _.find(this.breakpoints, comparator)

    if (entry === undefined ||
        (entry.condition && entry.condition === condition)) {
      return false
    }

    entry.condition = condition
    this.emitter.emit('breakpoint', new BreakpointEvent('condition-added', entry))
    return true
  }

  clearBreakpointCondition(breakpoint: Breakpoint): boolean {
    const comparator = (val) => breakpoint.equals(val)
    const entry = _.find(this.breakpoints, comparator)

    if (entry === undefined || !entry.condition) {
      return false
    }

    entry.condition = null
    const evt = new BreakpointEvent('condition-removed', entry)

    this.emitter.emit('breakpoint', evt)
    return true
  }

  stop(): void {
    const debug = this.getActiveDebugger()

    if (debug) {
      debug.stop()
    }
  }

  resume(): void {
    const debug = this.getActiveDebugger()

    if (debug) {
      debug.resume()
    }
  }

  pause(): void {
    const debug = this.getActiveDebugger()

    if (debug) {
      debug.pause()
    }
  }

  stepInto(): void {
    const debug = this.getActiveDebugger()

    if (debug) {
      debug.stepInto()
    }
  }

  stepOver(): void {
    const debug = this.getActiveDebugger()

    if (debug) {
      debug.stepOver()
    }
  }

  getCallStack(): Promise<Array<StackFrame>> {
    const debug = this.getActiveDebugger()

    if (debug) {
      return debug.getCallStack()
    }

    throw Error('No Session in progress')
  }

  getSelectedFrame(): Promise<StackFrame> {
    const debug = this.getActiveDebugger()

    if (debug) {
      return debug.getSelectedFrame()
    }

    throw Error('No Session in progress')
  }

  setSelectedFrame(level: number): void {
    const debug = this.getActiveDebugger()

    if (debug) {
      debug.setSelectedFrame(level)
    }
  }

  getVariableList(): Promise<Array<Variable>> {
    const debug = this.getActiveDebugger()

    if (debug) {
      return debug.getVariableList()
    }

    throw Error('No Session in progress')
  }

  onBreakpointEvent(callback: ((event: BreakpointEvent) => void)): Disposable {
    return this.emitter.on('breakpoint', callback)
  }

  onSessionEvent(callback: ((event: SessionEvent) => void)): Disposable {
    return this.emitter.on('session', callback)
  }

  onTargetEvent(callback: ((event: TargetEvent) => void)): Disposable {
    return this.emitter.on('target', callback)
  }
}
