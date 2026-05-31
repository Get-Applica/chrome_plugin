/**
 * Shared constants for drawer, content script, and background.
 */
(function () {
  const APPLICATION_STATUS_OPTIONS = [
    ['Applied', 'applied'],
    ['Interviewing - Screening', 'screening'],
    ['Interviewing - Early', 'early'],
    ['Interviewing - Mid', 'mid'],
    ['Interviewing - Late', 'late'],
    ['Offered', 'offered'],
    ['Closed - Rejected', 'rejected'],
    ['Closed - Declined', 'declined'],
    ['Closed - Hired', 'hired']
  ];

  window.ApplicaConstants = {
    APPLICATION_STATUS_OPTIONS,
    STORAGE: {
      DRAWER_VIEW_STATE: 'applica_drawer_view_state',
      DRAWER_APPLICATIONS_VIEW: 'applica_drawer_applications_view_state',
      DRAWER_SELECTED_PERSONA: 'applica_drawer_selected_persona_id',
      REOPEN_DRAWER_TS: 'applica_reopen_drawer_ts'
    }
  };
})();
