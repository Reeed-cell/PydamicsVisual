// Global error logger — catches real JS errors and unhandled promise
// rejections anywhere on the site, and logs them to Supabase.
// Include this AFTER supabase-config.js on every page.

(function () {
  async function logError(errorData) {
    try {
      let staffId = null;
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session) {
        const { data: staffRow } = await supabaseClient
          .from('staff')
          .select('id')
          .eq('auth_user_id', session.user.id)
          .single();
        if (staffRow) staffId = staffRow.id;
      }

      await supabaseClient.from('error_logs').insert([{
        message: errorData.message,
        source_url: errorData.source || null,
        line_number: errorData.lineno || null,
        column_number: errorData.colno || null,
        stack: errorData.stack || null,
        page_url: window.location.href,
        user_agent: navigator.userAgent,
        staff_id: staffId,
      }]);
    } catch (loggingError) {
      // If logging itself fails, don't loop — just note it locally.
      console.error('Error logging failed:', loggingError);
    }
  }

  window.addEventListener('error', (event) => {
    logError({
      message: event.message,
      source: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    logError({
      message: `Unhandled promise rejection: ${event.reason?.message || event.reason}`,
      stack: event.reason?.stack,
    });
  });
})();
