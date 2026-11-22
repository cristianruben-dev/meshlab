// @vitest-environment happy-dom
import { beforeEach, expect, it } from 'vitest'
import { defaultBoardSettings, readBoardSettings, saveBoardSettings } from './settings'

beforeEach(() => localStorage.clear())

it('round-trips saved settings', () => {
  const value = { size: 'full', rails: true, splitRails: true, labels: false } as const
  saveBoardSettings(value)
  expect(readBoardSettings()).toEqual(value)
})

it('falls back to the defaults for missing, unknown, or invalid values', () => {
  expect(readBoardSettings()).toEqual(defaultBoardSettings)
  localStorage.setItem('meshlab:board', '{broken')
  expect(readBoardSettings()).toEqual(defaultBoardSettings)
  localStorage.setItem('meshlab:board', '[]')
  expect(readBoardSettings()).toEqual(defaultBoardSettings)
  localStorage.setItem('meshlab:board', JSON.stringify({ size: 'giant', rails: 'yes', splitRails: true, labels: false, extra: 1 }))
  expect(readBoardSettings()).toEqual({ ...defaultBoardSettings, splitRails: true, labels: false })
})
