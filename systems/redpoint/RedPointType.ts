/**
 * 红点类型（框架级统一枚举，所有项目共用）
 *
 * 必须是**数值枚举**，`cc.Enum` 才能在 Inspector 里渲染成下拉框并正确序列化；
 * 新增红点分类时在这里追加，数值只增不改，避免已序列化的预制体错位。
 */
export enum RedPointType {
    None = 0,
    Mail = 1,//邮件
    Shop = 2,//商店
    Task = 3,//任务
    League = 4,//联赛
    SevenSign = 5,//七天签到
    FirstCharge = 6,//首次充值
    ShopFree = 7,//商城免费商品

    // ===== 100 起为业务扩展段 =====

    // 消息中心 · 大厅分类有新消息
    CenterHall = 100,
    // 消息中心 · 俱乐部分类有新消息
    CenterClub = 101,
    // 消息中心 · 房间分类有新消息
    CenterRoom = 102,
    // 消息中心 · 系统分类有新消息
    CenterSystem = 103,
}