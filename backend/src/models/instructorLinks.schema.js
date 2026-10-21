import mongoose from 'mongoose';

import {
  isValidInstructorLinkLabel,
  normalizeInstructorUrl,
} from '../utils/instructorLinks.js';

function createInstructorLinkSchema() {
  return new mongoose.Schema({
    label: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 80,
      validate: isValidInstructorLinkLabel,
    },
    url: {
      type: String,
      required: true,
      maxlength: 2048,
      set: value => normalizeInstructorUrl(value) ?? value,
      validate: value => normalizeInstructorUrl(value) === value,
    },
  }, { _id: false });
}

export function createInstructorLinksField() {
  return {
    type: [createInstructorLinkSchema()],
    default: [],
    validate: {
      validator: links => links.length <= 5
        && new Set(links.map(link => link.url)).size === links.length,
      message: 'Instructor links must contain at most five unique URLs',
    },
  };
}
