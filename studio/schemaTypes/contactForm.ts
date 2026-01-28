import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'contactForm',
  title: 'VIP Booking Form',
  type: 'object',
  fields: [
    defineField({
      name: 'title',
      title: 'Form Title',
      type: 'string',
      initialValue: 'VIP Booking Request',
    }),
    defineField({
      name: 'description',
      title: 'Form Description',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'backgroundImage',
      title: 'Background Image',
      type: 'image',
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: 'backgroundColor',
      title: 'Background Color',
      type: 'string',
      options: {
        list: [
          { title: 'Dark', value: 'dark' },
          { title: 'Darker', value: 'darker' },
          { title: 'Gold', value: 'gold' },
        ],
      },
      initialValue: 'darker',
      hidden: ({ parent }) => !!parent?.backgroundImage,
    }),
    defineField({
      name: 'enabledFields',
      title: 'Enabled Form Fields',
      description: 'Select which fields to display on the form',
      type: 'object',
      fields: [
        {
          name: 'firstName',
          title: 'First Name',
          type: 'boolean',
          initialValue: true,
        },
        {
          name: 'lastName',
          title: 'Last Name',
          type: 'boolean',
          initialValue: true,
        },
        {
          name: 'email',
          title: 'Email Address',
          type: 'boolean',
          initialValue: true,
        },
        {
          name: 'phone',
          title: 'Mobile Phone',
          type: 'boolean',
          initialValue: true,
        },
        {
          name: 'date',
          title: 'Reservation Date',
          type: 'boolean',
          initialValue: true,
        },
        {
          name: 'partySize',
          title: 'Party Size',
          type: 'boolean',
          initialValue: true,
        },
        {
          name: 'additionalDetails',
          title: 'Additional Details',
          type: 'boolean',
          initialValue: true,
        },
      ],
    }),
    defineField({
      name: 'requiredFields',
      title: 'Required Fields',
      description: 'Select which fields are required',
      type: 'object',
      fields: [
        {
          name: 'firstName',
          title: 'First Name',
          type: 'boolean',
          initialValue: true,
        },
        {
          name: 'lastName',
          title: 'Last Name',
          type: 'boolean',
          initialValue: true,
        },
        {
          name: 'email',
          title: 'Email Address',
          type: 'boolean',
          initialValue: true,
        },
        {
          name: 'phone',
          title: 'Mobile Phone',
          type: 'boolean',
          initialValue: false,
        },
        {
          name: 'date',
          title: 'Reservation Date',
          type: 'boolean',
          initialValue: true,
        },
        {
          name: 'partySize',
          title: 'Party Size',
          type: 'boolean',
          initialValue: true,
        },
        {
          name: 'additionalDetails',
          title: 'Additional Details',
          type: 'boolean',
          initialValue: false,
        },
      ],
    }),
    defineField({
      name: 'submitButtonText',
      title: 'Submit Button Text',
      type: 'string',
      initialValue: 'Submit Booking Request',
    }),
    defineField({
      name: 'successMessage',
      title: 'Success Message',
      type: 'text',
      rows: 3,
      initialValue: 'Thank you for your booking request. We will contact you shortly to confirm your reservation.',
    }),
    defineField({
      name: 'errorMessage',
      title: 'Error Message',
      type: 'text',
      rows: 3,
      initialValue: 'There was an error submitting your request. Please try again or contact us directly.',
    }),
    defineField({
      name: 'recipientEmail',
      title: 'Recipient Email',
      description: 'Email address where form submissions will be sent',
      type: 'string',
      validation: (Rule) => Rule.email(),
    }),
  ],
  preview: {
    select: {
      title: 'title',
    },
    prepare({ title }) {
      return {
        title: title || 'VIP Booking Form',
      };
    },
  },
}); 