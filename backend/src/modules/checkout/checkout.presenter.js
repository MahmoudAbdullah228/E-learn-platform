export function toCheckoutOrder(order) {
  return { id: order._id.toString(), courseId: order.courseId.toString(),
    courseTitle: order.courseTitleSnapshot, amountMinor: order.amountMinor,
    currency: order.currency, status: order.status, expiresAt: order.expiresAt,
    createdAt: order.createdAt };
}
