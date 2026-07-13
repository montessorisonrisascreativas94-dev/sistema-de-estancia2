import { supabase } from '../shared/supabase.js';

export const ParentRatingModule = {
  async init() {
    console.log('ParentRatingModule inicializado');
    await this.checkPendingRating();
    this.initializeEventListeners();
  },

  initializeEventListeners() {
    const ratingForm = document.getElementById('parent-rating-form');
    if (ratingForm) {
      ratingForm.addEventListener('submit', (e) => this.handleRatingSubmit(e));
    }

    const starsContainer = document.getElementById('rating-stars');
    if (starsContainer) {
      starsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('star')) {
          const rating = parseInt(e.target.dataset.rating);
          this.setRating(rating);
        }
      });
      starsContainer.addEventListener('mouseover', (e) => {
        if (e.target.classList.contains('star')) {
          const rating = parseInt(e.target.dataset.rating);
          this.highlightStars(rating);
        }
      });
      starsContainer.addEventListener('mouseout', () => {
        const currentRating = document.getElementById('rating-input')?.value || 0;
        this.highlightStars(parseInt(currentRating));
      });
    }
  },

  setRating(rating) {
    const input = document.getElementById('rating-input');
    if (input) input.value = rating;
    this.highlightStars(rating);
  },

  highlightStars(rating) {
    document.querySelectorAll('#rating-stars .star').forEach((star, index) => {
      star.classList.toggle('text-yellow-400', index < rating);
      star.classList.toggle('text-gray-300', index >= rating);
    });
  },

  async checkPendingRating() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const currentMonth = new Date().toISOString().slice(0, 7);
      const banner = document.getElementById('pending-rating-banner');

      const { data, error } = await supabase
        .from('parent_ratings')
        .select('id')
        .eq('parent_id', user.id)
        .eq('month', currentMonth)
        .maybeSingle();

      if (error) {
        // Table may not exist yet — silently hide banner
        console.warn('[ParentRating] parent_ratings table not found:', error.message);
        if (banner) banner.classList.add('hidden');
        return;
      }

      if (banner) banner.classList.toggle('hidden', !!data);
    } catch (error) {
      console.warn('[ParentRating] checkPendingRating:', error.message);
    }
  },

  async handleRatingSubmit(e) {
    e.preventDefault();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const rating          = parseInt(document.getElementById('rating-input')?.value || '0');
      const comment         = document.getElementById('rating-comment')?.value || '';
      const recommendations = document.getElementById('rating-recommendations')?.value || '';
      const observations    = document.getElementById('rating-observations')?.value || '';
      const currentMonth    = new Date().toISOString().slice(0, 7);

      // Get child's teacher
      const { data: childData } = await supabase
        .from('students')
        .select('classroom_id, classrooms(teacher_id)')
        .eq('parent_id', user.id)
        .limit(1)
        .maybeSingle();

      const teacherId = childData?.classrooms?.teacher_id || null;

      const { error: insertError } = await supabase
        .from('parent_ratings')
        .insert({ parent_id: user.id, teacher_id: teacherId, month: currentMonth, rating, comment, recommendations, observations });

      if (insertError) throw insertError;

      alert('¡Gracias por tu valoración!');
      document.getElementById('parent-rating-form')?.reset();
      this.setRating(0);
      document.getElementById('rating-modal')?.classList.add('hidden');
      await this.checkPendingRating();

    } catch (error) {
      console.error('[ParentRating] handleRatingSubmit:', error.message);
      alert('Error al enviar la valoración');
    }
  }
};
