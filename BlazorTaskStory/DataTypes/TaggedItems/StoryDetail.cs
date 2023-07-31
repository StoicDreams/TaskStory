namespace StoicDreams.WebApp.DataTypes.TaggedItems;

public class StoryDetail : BaseTaggedItem
{
	public string PublishedOwner { get; set; } = string.Empty;
	public string Problem { get; set; } = string.Empty;
	public string IntegratedSolutions { get; set; } = string.Empty;
	public string DroppedSolutions { get; set; } = string.Empty;

	public override string GetTitle => $"{Name} - Published by {PublishedOwner}";

	public override string GetMarkdown => $@"{base.GetMarkdown}
| Published Owner | {PublishedOwner}

## Problem

<div class=""problem"">

{Problem}

</div>

## Integrated Solutions

<div class=""integrated-solutions"">

{IntegratedSolutions}

</div>

## Dropped Solutions

<div class=""dropped-solutions"">

{DroppedSolutions}

</div>
".Trim();

	public override string ToString()
	{
		return $"{base.ToString()}_{PublishedOwner}_{Problem.GetStaticHashCode()}_{IntegratedSolutions.GetStaticHashCode()}_{DroppedSolutions.GetStaticHashCode()}";
	}
}
