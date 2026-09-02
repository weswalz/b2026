// Self-hosted TinyMCE for the page editor — no cloud CDN, no API key.
export const TINYMCE_AVAILABLE = true;
export const TINYMCE_SCRIPT = '/tinymce/tinymce.min.js';

export const TINYMCE_INIT = {
  height: 260,
  menubar: false,
  skin: 'oxide-dark',
  content_css: 'dark',
  plugins: 'link lists code table',
  toolbar: 'undo redo | h2 h3 | bold italic underline | alignleft aligncenter alignright | bullist numlist | link | code',
};
