namespace StoicDreams.WebApp.DataTypes;

public class DisplayContentParam<TItem> where TItem : BaseTaggedItem, new()
{
	public TItem Item { get; set; } = new();
	public int NowShowing { get; set; }
}
