// Canonical validation rules per assigned file "type".
// Keys here correspond to normalized headers from /js/parser.js (normalizeHeader).

export const SCHEMAS = {
  systems: {
    label: 'Systems',
    // Sample file fields: Project, Plant, System, Description
    // We require the minimum needed for your table + lookups.
    required: ['system', 'description'],
    oneOfGroups: [], // no alternates needed
    optional: ['project', 'plant']
  },

  checklists: {
    label: 'Checklists',
    // Sample file fields include: Status, Cert ID, Tag No, Resp ID, Cert Description, Project, System, etc.
    // Require the identifiers + routing columns you use most across dashboards.
    required: [
      'status',
      'cert_id',
      'tag_no',
      'resp_id',
      'cert_description',
      'project',
      'system',
      'sub_system',
      'cert_disc',
      'area',
      'event_id',
      'event_description',
      'actual_utc8',
      'created_utc8'
    ],
    oneOfGroups: [],
    optional:[],
  },

  punch: {
    label: 'Punch Items',
    // Sample file fields include: Status, Punch ID, Cat, Project, Subsystem, Description, Disc, ...
    // Category (from "Cat") is required for your chart plans.
    required: [
      'status',
      'punch_id',
      'category',
      'project',
      'sub_system',
      'description',
      'discipline'
    ],
    oneOfGroups: [],
    optional: [
      'tag_no',
      'phase',
      'action_by',
      'resp_id',
      'package',
      'checklist',
      'due_date',
      'raised_utc8',
      'cleared_utc8',
      'verified_utc8',
      'checked_out_utc8',
      'raised_by',
      'cleared_by',
      'verified_by',
      'checked_out_by',
      'current_sign_group',
      'is_overdue',
      'plant'
    ]
  },
  contractors: {
    label: 'Contractors',
    required: [
      'contractor_id',
      'description',
      'contract_no'
    ],
    oneOfGroups: [],
    optional:[],
  }
};