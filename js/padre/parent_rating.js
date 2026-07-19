import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';

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
        const star = e.target.closest('[data-rating]');
        if (star) {
          const rating = parseInt(star.dataset.rating);
          this.setRating(rating);
        }
      });
      starsContainer.addEventListener('mouseover', (e) => {
        const star = e.target.closest('[data-rating]');
        if (star) {
          const rating = parseInt(star.dataset.rating);
          this.highlightStars(rating);
        }
      });
      starsContainer.addEventListener('mouseout', () => {
        const currentRating = parseInt(document.getElementById('rating-input')?.value || '0');
        this.highlightStars(currentRating);
      });
    }
  },

  setRating(rating) {
    const input = document.getElementById('rating-input');
    if (input) input.value = rating;
    this.highlightStars(rating);
  },

  highlightStars(rating) {
    const stars = document.querySelectorAll('#rating-stars [data-rating]');
    stars.forEach((starEl) => {
      const starRating = parseInt(starEl.dataset.rating);
      const icon = starEl.querySelector('i') || starEl;
      if (starRating <= rating) {
        starEl.classList.remove('text-slate-300');
        starEl.classList.add('text-yellow-400', 'fill-yellow-400');
      } else {
        starEl.classList.add('text-slate-300');
        starEl.classList.remove('text-yellow-400', 'fill-yellow-400');
      }
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
        console.warn('[ParentRating] parent_ratings table not found:', error.message);
        if (banner) banner.classList.add('hidden');
        return;
      }

      if (banner) banner.classList.toggle('hidden', !!data);
    } catch (err) {
      console.warn('[ParentRating] checkPendingRating:', err.message);
    }
  },

  async handleRatingSubmit(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalHTML = submitBtn.innerHTML;
    
    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin inline mr-2"></i>Enviando...';
      if (window.lucide) lucide.createIcons();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No hay usuario autenticado');

      const rating = parseInt(document.getElementById('rating-input')?.value || '0');
      const comment = document.getElementById('rating-comment')?.value || '';
      const recommendations = document.getElementById('rating-recommendations')?.value || '';
      const observations = document.getElementById('rating-observations')?.value || '';
      const currentMonth = new Date().toISOString().slice(0, 7);

      if (rating < 1 || rating > 5) {
        Helpers.toast('Por favor selecciona una calificación', 'warning');
        return;
      }

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
        .insert({ 
          parent_id: user.id, 
          teacher_id: teacherId, 
          month: currentMonth, 
          rating, 
          comment, 
          recommendations, 
          observations 
        });

      if (insertError) throw insertError;

      Helpers.toast('¡Gracias por tu valoración!', 'success');
      document.getElementById('parent-rating-form')?.reset();
      this.setRating(0);
      document.getElementById('rating-modal')?.classList.add('hidden');
      await this.checkPendingRating();

    } catch (err) {
      console.error('[ParentRating] handleRatingSubmit:', err.message);
      Helpers.toast('Error al enviar la valoración', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalHTML;
      if (window.lucide) lucide.createIcons();
    }
  }
};
