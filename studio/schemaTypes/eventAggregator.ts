import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'eventAggregator',
  title: 'Event Aggregator',
  type: 'object',
  fields: [
    defineField({
      name: 'title',
      title: 'Section Title',
      type: 'string',
      initialValue: 'Upcoming Events',
    }),
    defineField({
      name: 'description',
      title: 'Section Description',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'layout',
      title: 'Layout Style',
      type: 'string',
      options: {
        list: [
          { title: 'Grid', value: 'grid' },
          { title: 'List', value: 'list' },
          { title: 'Calendar', value: 'calendar' },
        ],
      },
      initialValue: 'grid',
    }),
    defineField({
      name: 'displayOptions',
      title: 'Display Options',
      type: 'object',
      fields: [
        {
          name: 'showFlyer',
          title: 'Show Event Flyer',
          type: 'boolean',
          initialValue: true,
        },
        {
          name: 'showLocation',
          title: 'Show Location',
          type: 'boolean',
          initialValue: true,
        },
        {
          name: 'showDate',
          title: 'Show Date',
          type: 'boolean',
          initialValue: true,
        },
        {
          name: 'showTime',
          title: 'Show Time',
          type: 'boolean',
          initialValue: true,
        },
        {
          name: 'showDescription',
          title: 'Show Description',
          type: 'boolean',
          initialValue: true,
        },
        {
          name: 'showTicketLink',
          title: 'Show Ticket Link',
          type: 'boolean',
          initialValue: true,
        },
        {
          name: 'showVipLink',
          title: 'Show VIP Link',
          type: 'boolean',
          initialValue: true,
        },
      ],
    }),
    defineField({
      name: 'eventsFilter',
      title: 'Events Filter',
      type: 'string',
      options: {
        list: [
          { title: 'All Upcoming Events', value: 'upcoming' },
          { title: 'Featured Events Only', value: 'featured' },
          { title: 'Custom Selection', value: 'custom' },
        ],
      },
      initialValue: 'upcoming',
    }),
    defineField({
      name: 'selectedEvents',
      title: 'Selected Events',
      description: 'Select specific events to display',
      type: 'array',
      of: [
        {
          type: 'reference',
          to: [{ type: 'event' }],
        },
      ],
      hidden: ({ parent }) => parent?.eventsFilter !== 'custom',
    }),
    defineField({
      name: 'maxEvents',
      title: 'Maximum Events',
      description: 'Maximum number of events to display (leave blank for all)',
      type: 'number',
      hidden: ({ parent }) => parent?.eventsFilter === 'custom',
    }),
    defineField({
      name: 'pastEventsOption',
      title: 'Past Events Option',
      type: 'string',
      options: {
        list: [
          { title: 'Hide All Past Events', value: 'hide' },
          { title: 'Show Recent Past Events', value: 'recent' },
          { title: 'Show All Events', value: 'all' },
        ],
      },
      initialValue: 'hide',
      hidden: ({ parent }) => parent?.eventsFilter === 'custom',
    }),
    defineField({
      name: 'recentPastDays',
      title: 'Recent Past Days',
      description: 'Number of days to consider an event "recent past"',
      type: 'number',
      initialValue: 7,
      hidden: ({ parent }) => parent?.pastEventsOption !== 'recent' || parent?.eventsFilter === 'custom',
    }),
    defineField({
      name: 'ctaButton',
      title: 'Section Call-to-Action',
      description: 'Add a call-to-action button at the bottom of the events list',
      type: 'object',
      fields: [
        {
          name: 'text',
          title: 'Button Text',
          type: 'string',
          initialValue: 'View All Events',
        },
        {
          name: 'link',
          title: 'Button Link',
          type: 'string',
        },
        {
          name: 'showButton',
          title: 'Show Button',
          type: 'boolean',
          initialValue: true,
        },
      ],
    }),
    defineField({
      name: 'noEventsMessage',
      title: 'No Events Message',
      description: 'Message to display when there are no upcoming events',
      type: 'text',
      rows: 2,
      initialValue: 'No upcoming events currently scheduled. Please check back soon!',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      filter: 'eventsFilter',
    },
    prepare({ title, filter }) {
      const filterMap = {
        upcoming: 'All Upcoming Events',
        featured: 'Featured Events Only',
        custom: 'Custom Selection',
      };
      
      return {
        title: title || 'Event Aggregator',
        subtitle: filterMap[filter] || 'Event Aggregator',
      };
    },
  },
}); 