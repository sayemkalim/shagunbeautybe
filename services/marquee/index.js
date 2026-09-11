const MarqueeRepository = require("../../repositories/marquee/index.js");

const getAllMarquees = async ({ page = 1, per_page = 50, is_active }) => {
  const skip = (page - 1) * per_page;
  const limit = parseInt(per_page, 10);

  const marquees = await MarqueeRepository.getAllMarquees({ skip, limit, is_active });
  const total = await MarqueeRepository.countAllMarquees({ is_active });

  return {
    total,
    page: parseInt(page, 10),
    per_page: limit,
    total_pages: Math.ceil(total / limit) || 1,
    marquees,
  };
};

const getActiveMarquees = async () => {
  return await MarqueeRepository.getActiveMarquees();
};

const getMarqueeById = async (id) => {
  return await MarqueeRepository.getMarqueeById(id);
};

const createMarquee = async (data) => {
  const marquee = await MarqueeRepository.createMarquee(data);
  return { success: true, marquee };
};

const updateMarquee = async (id, data) => {
  const marquee = await MarqueeRepository.updateMarquee(id, data);
  return { success: true, marquee };
};

const deleteMarquee = async (id) => {
  return await MarqueeRepository.deleteMarquee(id);
};

module.exports = {
  getAllMarquees,
  getActiveMarquees,
  getMarqueeById,
  createMarquee,
  updateMarquee,
  deleteMarquee,
};
