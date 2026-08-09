/**
 * Module B: IPLSRL Team Engine
 * Dynamic team management, rating configurations, and venue assignments.
 */

import { teamKitColors } from './jerseyColors.mjs';

const DEFAULT_TEAMS = [
  {
    teamId: 'csk_srl',
    teamName: 'Chennai Super Kings SRL',
    shortName: 'CSK',
    logo: '🦁',
    country: 'India',
    homeVenue: 'MA Chidambaram Stadium, Chennai',
    primaryColor: '#facc15',
    secondaryColor: '#1e3a8a',
    squad: ['p_csk_1', 'p_csk_2', 'p_csk_3', 'p_csk_4', 'p_csk_5', 'p_csk_6', 'p_csk_7', 'p_csk_8', 'p_csk_9', 'p_csk_10', 'p_csk_11'],
    captain: 'p_csk_2',
    viceCaptain: 'p_csk_5',
    coach: 'Stephen Fleming',
    strengthRating: 85,
    status: 'ACTIVE',
  },
  {
    teamId: 'mi_srl',
    teamName: 'Mumbai Indians SRL',
    shortName: 'MI',
    logo: '⚡',
    country: 'India',
    homeVenue: 'Wankhede Stadium, Mumbai',
    primaryColor: '#0284c7',
    secondaryColor: '#eab308',
    squad: ['p_mi_1', 'p_mi_2', 'p_mi_3', 'p_mi_4', 'p_mi_5', 'p_mi_6', 'p_mi_7', 'p_mi_8', 'p_mi_9', 'p_mi_10', 'p_mi_11'],
    captain: 'p_mi_1',
    viceCaptain: 'p_mi_4',
    coach: 'Mahela Jayawardene',
    strengthRating: 87,
    status: 'ACTIVE',
  },
  {
    teamId: 'rcb_srl',
    teamName: 'Royal Challengers Bengaluru SRL',
    shortName: 'RCB',
    logo: '🔴',
    country: 'India',
    homeVenue: 'M. Chinnaswamy Stadium, Bengaluru',
    primaryColor: '#dc2626',
    secondaryColor: '#111827',
    squad: ['p_rcb_1', 'p_rcb_2', 'p_rcb_3', 'p_rcb_4', 'p_rcb_5', 'p_rcb_6', 'p_rcb_7', 'p_rcb_8', 'p_rcb_9', 'p_rcb_10', 'p_rcb_11'],
    captain: 'p_rcb_1',
    viceCaptain: 'p_rcb_3',
    coach: 'Andy Flower',
    strengthRating: 84,
    status: 'ACTIVE',
  },
  {
    teamId: 'kkr_srl',
    teamName: 'Kolkata Knight Riders SRL',
    shortName: 'KKR',
    logo: '💜',
    country: 'India',
    homeVenue: 'Eden Gardens, Kolkata',
    primaryColor: '#7e22ce',
    secondaryColor: '#eab308',
    squad: ['p_kkr_1', 'p_kkr_2', 'p_kkr_3', 'p_kkr_4', 'p_kkr_5', 'p_kkr_6', 'p_kkr_7', 'p_kkr_8', 'p_kkr_9', 'p_kkr_10', 'p_kkr_11'],
    captain: 'p_kkr_4',
    viceCaptain: 'p_kkr_5',
    coach: 'Chandrakant Pandit',
    strengthRating: 86,
    status: 'ACTIVE',
  },
  {
    teamId: 'gt_srl',
    teamName: 'Gujarat Titans SRL',
    shortName: 'GT',
    logo: '⚓',
    country: 'India',
    homeVenue: 'Narendra Modi Stadium, Ahmedabad',
    primaryColor: '#0f172a',
    secondaryColor: '#38bdf8',
    squad: ['p_gt_1', 'p_gt_2', 'p_gt_3', 'p_gt_4', 'p_gt_5', 'p_gt_6', 'p_gt_7', 'p_gt_8', 'p_gt_9', 'p_gt_10', 'p_gt_11'],
    captain: 'p_gt_1',
    viceCaptain: 'p_gt_6',
    coach: 'Ashish Nehra',
    strengthRating: 85,
    status: 'ACTIVE',
  },
  {
    teamId: 'srh_srl',
    teamName: 'Sunrisers Hyderabad SRL',
    shortName: 'SRH',
    logo: '🦅',
    country: 'India',
    homeVenue: 'Rajiv Gandhi International Cricket Stadium, Hyderabad',
    primaryColor: '#f97316',
    secondaryColor: '#09090b',
    squad: ['p_srh_1', 'p_srh_2', 'p_srh_3', 'p_srh_4', 'p_srh_5', 'p_srh_6', 'p_srh_7', 'p_srh_8', 'p_srh_9', 'p_srh_10', 'p_srh_11'],
    captain: 'p_srh_7',
    viceCaptain: 'p_srh_1',
    coach: 'Daniel Vettori',
    strengthRating: 83,
    status: 'ACTIVE',
  },
];

let teamsStore = [...DEFAULT_TEAMS];

export function getAllIPLSRLTeams() {
  return teamsStore;
}

export function getIPLSRLTeamById(teamId) {
  return teamsStore.find(t => t.teamId === teamId) || null;
}

export function createIPLSRLTeam(teamData) {
  const newTeam = {
    teamId: teamData.teamId || `team_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    teamName: teamData.teamName || 'Custom SRL Team',
    shortName: teamData.shortName || 'CST',
    logo: teamData.logo || '🏏',
    country: teamData.country || 'India',
    homeVenue: teamData.homeVenue || 'Generic Cricket Ground',
    primaryColor: teamData.primaryColor || '#3b82f6',
    secondaryColor: teamData.secondaryColor || '#1e293b',
    squad: teamData.squad || [],
    captain: teamData.captain || null,
    viceCaptain: teamData.viceCaptain || null,
    coach: teamData.coach || 'Head Coach',
    strengthRating: Number(teamData.strengthRating) || 80,
    status: 'ACTIVE',
  };
  teamsStore.push(newTeam);
  return newTeam;
}

export function updateIPLSRLTeam(teamId, updates) {
  const idx = teamsStore.findIndex(t => t.teamId === teamId);
  if (idx < 0) return null;
  teamsStore[idx] = { ...teamsStore[idx], ...updates };
  return teamsStore[idx];
}

export function deleteIPLSRLTeam(teamId) {
  const idx = teamsStore.findIndex(t => t.teamId === teamId);
  if (idx < 0) return false;
  teamsStore[idx].status = 'DISABLED';
  return true;
}

export function assignPlayerToTeam(teamId, playerId) {
  const team = getIPLSRLTeamById(teamId);
  if (!team) return false;
  if (!team.squad.includes(playerId)) {
    team.squad.push(playerId);
  }
  return true;
}
