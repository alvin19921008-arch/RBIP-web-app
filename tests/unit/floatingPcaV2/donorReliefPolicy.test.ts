import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  isA1PeelToTeam,
  isB1DonateSortKey,
  parseA1PeelRescueTeam,
  parseB1DonateFromTeam,
} from '../../../lib/algorithms/floatingPcaV2/donorReliefPolicy'

describe('donorReliefPolicy', () => {
  it('isB1DonateSortKey matches b1:donate: prefix only', () => {
    assert.equal(isB1DonateSortKey('b1:donate:pca-1:2:NSM->CPPC'), true)
    assert.equal(isB1DonateSortKey('b1:move:x:1:y:2'), false)
    assert.equal(isB1DonateSortKey('b1:swap:x:1:y:2'), false)
    assert.equal(isB1DonateSortKey('b1:donate'), false)
  })

  it('parseB1DonateFromTeam matches generateB1Candidates template', () => {
    assert.equal(parseB1DonateFromTeam('b1:donate:shaohua:1:GMC->CPPC'), 'GMC')
    assert.equal(parseB1DonateFromTeam('b1:donate:uuid-with-dashes:4:DRO->NSM'), 'DRO')
    assert.equal(parseB1DonateFromTeam('b1:move:a:1:b:2'), null)
    assert.equal(parseB1DonateFromTeam('b1:donate:bad:1:XX->CPPC'), null)
  })

  it('parseA1PeelRescueTeam / isA1PeelToTeam match generateA1Candidates a1:peel template', () => {
    const key = 'a1:peel:staffA:2:DRO->NSM'
    assert.equal(parseA1PeelRescueTeam(key), 'NSM')
    assert.equal(isA1PeelToTeam(key, 'NSM'), true)
    assert.equal(isA1PeelToTeam(key, 'DRO'), false)
    assert.equal(parseA1PeelRescueTeam('a1:swap:x:1:y:2:DRO->NSM'), null)
  })
})
