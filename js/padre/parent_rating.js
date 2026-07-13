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

    // Handle star rating click
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
        const currentRating = document.getElementById('rating-input').value || 0;
        this.highlightStars(parseInt(currentRating));
      });
    }
  },

  setRating(rating) {
    document.getElementById('rating-input').value = rating;
    this.highlightStars(rating);
  },

  highlightStars(rating) {
    const stars = document.querySelectorAll('#rating-stars .star');
    stars.forEach((star, index) => {
      if (index < rating) {
        star.classList.add('text-yellow-400');
        star.classList.remove('text-gray-300');
      } else {
        star.classList.remove('text-yellow-400');
        star.classList.add('text-gray-300');
      }
    });
  },

  async checkPendingRating() {
    try {
      const user = window.user;
      if (!user) return;

      const currentMonth = new Date().toISOString().slice(0, 7);
      const banner = document.getElementById('pending-rating-banner');

      // Check if rating already submitted this month
      const { data, error } = await window.supabase
        .from('parent_ratings')
        .select('*')
        .eq('parent_id', user.id)
        .eq('month', currentMonth)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        // Rating already submitted - hide banner
        if (banner) {
          banner.classList.add('hidden');
        }
      } else {
        // Pending rating - show banner
        if (banner) {
          banner.classList.remove('hidden');
        }
      }
    } catch (error) {
      console.error('Error al verificar calificación pendiente:', error);
    }
  },

  async handleRatingSubmit(e) {
    e.preventDefault();

    try {
      const user = window.user;
      const rating = parseInt(document.getElementById('rating-input').value);
      const comment = document.getElementById('rating-comment').value;
      const recommendations = document.getElementById('rating-recommendations').value;
      const observations = document.getElementById('rating-observations').value;
      const currentMonth = new Date().toISOString().slice(0, 7);

      // Get child's teacher
      const { data: childData, error: childError } = await window.supabase
        .from('students')
        .select('classroom_id, classrooms(teacher_id)')
        .eq('parent_id', user.id)
        .limit(1)
        .maybeSingle();

      if (childError) throw childError;

      const teacherId = childData?.classrooms?.teacher_id;

      const { error: insertError } = await window.supabase
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

      alert('¡Gracias por tu valoración!');
      this.checkPendingRating();
      document.getElementById('parent-rating-form').reset();
      this.setRating(0);

      document.getElementById('rating-modal').classList.add('hidden');

    } catch (error) {
      console.error('Error al enviar valoración:', error);
      alert('Error al enviar la valoración');
    }
  }
};
