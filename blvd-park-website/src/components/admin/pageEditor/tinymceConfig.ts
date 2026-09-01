// Shared TinyMCE gating for the page editor — same cloud-key contract as
// AdminPages.tsx: no API key → graceful textarea fallback, never a broken editor.
export const TINYMCE_API_KEY = import.meta.env.PUBLIC_TINYMCE_API_KEY as string | undefined;
export const TINYMCE_AVAILABLE = !!TINYMCE_API_KEY && TINYMCE_API_KEY !== 'no-api-key';
export const TINYMCE_SCRIPT = TINYMCE_AVAILABLE ? `https://cdn.tiny.cloud/1/${TINYMCE_API_KEY}/tinymce/6/tinymce.min.js` : '';

export const TINYMCE_INIT = {
  height: 260,
  menubar: false,
  skin: 'oxide-dark',
  content_css: 'dark',
  plugins: 'link lists code table',
  toolbar: 'undo redo | h2 h3 | bold italic underline | alignleft aligncenter alignright | bullist numlist | link | code',
};
